# VAT System for Osek Murshe — Implementation Spec (for `alex`)

**Author:** Shlomit (compliance) · **Researched:** 2026-06-17
**Skills used:** `anthropic-skills:israeli-vat-reporting` (output/input VAT calc, Doch Maam field mapping, deduction rules, zero-rated/exempt/Eilat) and `anthropic-skills:israeli-freelancer-ops` (reporting period frequency, filing deadlines, allocation-number thresholds).
**Audience:** senior full-stack dev. This is an engineering spec; regulation is cited only where it drives a data shape or a calculation.

> Disclaimer: guidance only, not accounting advice. A רו״ח / יועץ מס must confirm the turnover thresholds, deduction percentages, and Eilat handling before this ships to real users.

---

## 1. Summary

FinFlow today can compute **output VAT** per invoice (every `Invoice` carries `taxRate` + `total`) but **cannot compute input VAT** (the `Expense` model stores only a gross `amount`, no VAT split, no deductibility), and there is **no VAT report** anywhere — `TaxesView` only does income-tax estimation on paid revenue. For an Osek Murshe this is the core missing feature: a Doch Maam needs output VAT (accrual, by invoice date), input VAT (from expenses), the net, and period grouping.

This spec defines:
1. Field additions to `Expense` (net / VAT / deductibility) and a small addition to `Invoice` (VAT classification for zero-rated/exempt).
2. A new **pure** calculation module `src/utils/vatReport.ts`.
3. A new **VAT report view** with the 7 Doch Maam summary fields + CSV/PCN-style export.
4. Period grouping (monthly vs bi-monthly) and deadline display.
5. Edge-case handling (zero-rated, exempt, Eilat, refunds/cancellations).
6. Migration/back-compat for existing Drive `app_data.json` files (additive keys + defaults; no destructive migration).

All new model fields are **optional** so existing `app_data.json` blobs keep loading. The Drive store, the optimistic-concurrency `saveAppStateGuarded`, and `mergeAppState` need **no schema changes** — added fields ride along inside the existing `expenses`/`invoices`/`businessSettings` collections.

---

## 2. Regulatory basis (with sources)

| Rule | Value (confirmed today) | Effective | Source |
|---|---|---|---|
| Standard VAT rate | **18%** | 2025-01-01 | Already in `taxConfig.ts` `VAT_RATE_TABLE`; skill `israeli-vat-reporting`. |
| Output VAT basis | **Accrual** — by invoice/issue date, not when paid (general rule for goods/most services; cash basis is a specific permission for some professionals) | current | Skill `israeli-vat-reporting` Step 2–3. **Advisor-confirm** whether this Osek qualifies for cash-basis. |
| Reporting frequency | **Bi-monthly** below the turnover threshold; **monthly** above it | current | Skill `israeli-vat-reporting` Step 1. |
| Monthly-filing turnover threshold | **NIS 1,775,000** (indexed annually) | as of 2026-01-01 | Skill `israeli-vat-reporting` Step 1. Older sources cite NIS 1,490,000 (2018) — figure is CPI-indexed, so **advisor-confirm the current number**. ([Marosa](https://marosavat.com/vat-news/israel-changes-bi-monthly-vat-threshold)) |
| Periodic return (Doch Maam) deadline | **15th** of month after period (manual); **19th** if filed/paid online via SHAAM by 18:30 | current | Skill `israeli-vat-reporting` Step 5; skill `israeli-freelancer-ops` Step 4. |
| Detailed report (PCN874 / דוח מפורט) | Mandatory for **osek with annual turnover > NIS 500,000**; forces **monthly** filing; payment deadline moves to **23rd** | 2026-01-01 (first period Jan 2026 / Jan–Feb 2026) | ([gov.il detailed VAT reporting](https://www.gov.il/he/service/detailed-vat-reporting), [gov.il notice pa130725-2](https://www.gov.il/he/pages/pa130725-2), [amir-cpa](https://www.amir-cpa.net/post/דיווח-מפורט-למע-מ-לעצמאי-מ-2026-חובות-והקלות)) |
| Allocation number (מספר הקצאה) threshold (pre-VAT) | NIS 20,000 (2025) → **10,000 (2026-01-01)** → **5,000 (2026-06-01)** | per row | Already in `taxConfig.ts` `ALLOCATION_THRESHOLD_TABLE`; ([Herzog Law](https://herzoglaw.co.il/en/news-and-insights/overview-of-vat-and-customs-updates-effective-in-2026/)). **In effect now (2026-06-17): 5,000.** |
| Input VAT — vehicles | **2/3 deductible** (1/3 private) | current | Skill `israeli-vat-reporting` Step 3. |
| Input VAT — entertainment (כיבוד/אירוח) | **0% deductible** | current | Skill `israeli-vat-reporting` Step 3. |
| Input VAT — requires valid tax invoice w/ seller TIN (+ allocation number above threshold) | required | current | Skill Step 3 & 5. |
| Zero-rated (0%) vs exempt | Exports & Eilat-zone = 0% (reported, input VAT recoverable); exempt (e.g. residential rent, certain financial) = no VAT and **does not** support input-VAT recovery | current | Skill `israeli-vat-reporting` `references/special-cases.md`. |

---

## 3. Data-model changes

All edits are in `src/context/FinanceContext.tsx` (interfaces) plus default seeding. **Every new field is optional** for back-compat.

### 3.1 `Expense` — add input-VAT fields (the core gap)

Today:
```ts
export interface Expense {
  id, date, vendor, category, amount, receiptStatus, receiptName?, receiptUrl?, bookingAgentId?
}
```
`amount` is gross and there is no way to derive input VAT. Add:

```ts
export type VatDeductibility = 'full' | 'two_thirds' | 'none';

export interface Expense {
  // ...existing...
  amount: number;            // KEEP: gross (VAT-inclusive) total actually paid. Unchanged meaning.
  /** Net (pre-VAT) base of the expense. Optional; if absent, derive from amount + vatRate at read time. */
  netAmount?: number;
  /** VAT rate applied to this expense, %, by the expense date (usually 18; 0 for zero-rated/exempt purchases). */
  vatRate?: number;
  /** VAT portion in ₪ as it appears on the supplier invoice. Optional; derivable. */
  vatAmount?: number;
  /** How much of vatAmount is reclaimable as input VAT. Default 'full' for existing rows. */
  vatDeductibility?: VatDeductibility;
  /** True only when backed by a valid tax invoice (hashbonit mas) with the supplier's TIN — a precondition for any input-VAT claim. */
  hasValidTaxInvoice?: boolean;
  /** Supplier's allocation number, when the supplier was required to issue one (purchase >= dated threshold, pre-VAT). Missing it blocks the deduction above the threshold. */
  supplierAllocationNumber?: string;
}
```

**Derivation rule (single source of truth, implemented in the calc module, not the UI):** an expense's input-VAT triplet is resolved as:
- If `netAmount`/`vatAmount` are present, use them.
- Else if `vatRate` present, split `amount` gross-inclusive: `net = amount / (1 + vatRate/100)`, `vat = amount - net`.
- Else (legacy row, no VAT info): treat as **fully gross at the standard rate for its date** *only if* the UI flags it as a business tax-invoice expense; otherwise treat `vatAmount = 0`. See migration §8 — legacy rows default to `vatDeductibility: 'none'`/unknown so they are **not** silently claimed.

`vatDeductibility` maps to the claimable fraction:
- `full` → 100% of `vatAmount`
- `two_thirds` → 2/3 (vehicles)
- `none` → 0 (entertainment, private, non-tax-invoice)

### 3.2 `Invoice` — add VAT classification for output side

`taxRate` + `total` already give output VAT for standard transactions. What's missing is distinguishing **standard (18%)** from **zero-rated (0% export/Eilat)** from **exempt**, because they land in different Doch Maam fields and a 0% rate alone can't tell them apart.

```ts
export type VatTreatment = 'standard' | 'zero_rated' | 'exempt';

export interface Invoice {
  // ...existing...
  taxRate: number;           // KEEP
  total: number;             // KEEP
  /** VAT treatment for reporting. Defaults to 'standard'. 'zero_rated' = export/Eilat (taxRate 0, goes in Field 2); 'exempt' = Field 3. */
  vatTreatment?: VatTreatment;
}
```

> Note: `allocationNumber` already exists on `Invoice` (output side) — no change.

### 3.3 `BusinessSettings` — reporting profile

```ts
export interface BusinessSettings {
  // ...existing...
  /** VAT filing cadence. Default 'bimonthly'. Auto-suggested as 'monthly' when annual turnover crosses the threshold or PCN874 applies. */
  vatReportingPeriod?: 'monthly' | 'bimonthly';
  /** Whether the business is on cash basis for VAT (advisor-set). Default false = accrual. Controls output-VAT date basis. */
  vatCashBasis?: boolean;
}
```

`AppState` in `googleDrive.ts` needs **no edit** — these all live inside the already-serialized objects.

---

## 4. Calculation module

New file: **`src/utils/vatReport.ts`**. Pure, no React, no I/O — mirrors the existing `invoiceMath.ts` style so it is unit-testable in isolation. It must import `getVatRate` from `src/config/taxConfig.ts` and never hardcode 18.

```ts
import type { Invoice, Expense } from '../context/FinanceContext';

export type VatPeriodType = 'monthly' | 'bimonthly';

export interface VatPeriodKey {
  year: number;
  /** 1–12 for monthly; 1–6 for bimonthly (Jan-Feb=1 ... Nov-Dec=6). */
  index: number;
  type: VatPeriodType;
}

/** The 7 summary fields of the periodic VAT return (doch tkufati). */
export interface VatReport {
  period: VatPeriodKey;
  taxableSalesBase: number;     // Field 1 — net (pre-VAT) of standard-rated sales
  zeroRatedSales: number;       // Field 2 — exports / Eilat (base; VAT = 0)
  exemptSales: number;          // Field 3 — exempt sales (base)
  outputVat: number;            // Field 4 — Σ VAT on standard sales
  taxableInputsBase: number;    // Field 5 — net base of deductible purchases
  inputVat: number;             // Field 6 — Σ claimable input VAT (after deductibility factor)
  netVat: number;               // Field 7 — outputVat - inputVat (>0 pay, <0 refund)
  // diagnostics for the UI, not Doch Maam fields:
  excludedInputVat: number;     // VAT on non-deductible expenses (entertainment/private/missing tax invoice)
  invoicesMissingAllocation: string[]; // invoice ids >= threshold without allocationNumber
}

/** Map any ISO date to its VAT period under the given cadence. */
export function periodFor(dateIso: string, type: VatPeriodType): VatPeriodKey;

/** Stable string key, e.g. "2026-M03" or "2026-B02", for grouping/sorting. */
export function periodKeyString(p: VatPeriodKey): string;

/**
 * Output-VAT recognition date for an invoice.
 * - accrual (default): invoice.date
 * - cash basis: payment date — approximated by sentAt/paid transition; if unavailable, fall back to invoice.date and FLAG.
 * Cancelled/Draft invoices are excluded entirely. Refunded invoices reduce the period they belong to (see §7).
 */
export function outputRecognitionDate(inv: Invoice, cashBasis: boolean): string;

/** Claimable input VAT for one expense, applying the deductibility factor and validity gates. */
export function expenseInputVat(exp: Expense, standardRateOnDate: number): {
  net: number; vat: number; claimable: number; blockedReason?: string;
};

/** Build a full VatReport for one period from all invoices+expenses. Pure. */
export function buildVatReport(
  period: VatPeriodKey,
  invoices: Invoice[],
  expenses: Expense[],
  opts: { cashBasis: boolean; allocationThreshold: number }
): VatReport;

/** Group every transaction into its period and return reports sorted desc. */
export function buildAllVatReports(
  invoices: Invoice[],
  expenses: Expense[],
  opts: { type: VatPeriodType; cashBasis: boolean; allocationThresholdFor: (dateIso: string) => number }
): VatReport[];
```

### Calculation rules (must implement exactly)

**Output VAT (Field 4) and bases (1/2/3):** iterate invoices, exclude `status` `'Draft'` and `'Cancelled'`. Recompute the net/VAT split from the line items via the existing `computeTotals(items, taxRate)` rather than trusting `total` blindly (keeps one math path). Bucket by `vatTreatment`:
- `standard` → base into Field 1, `taxAmount` into Field 4.
- `zero_rated` → base into Field 2, VAT 0.
- `exempt` → base into Field 3, VAT 0.
- `Refunded` → subtract its base/VAT from the appropriate fields of the period its recognition date falls in (negative contribution), per §7.

**Input VAT (Fields 5/6):** for each expense in the period, call `expenseInputVat`. Add `net` to Field 5 and `claimable` to Field 6 **only when** `hasValidTaxInvoice !== false` AND (purchase net < allocation threshold OR `supplierAllocationNumber` present). Otherwise add the would-be VAT to `excludedInputVat` with a `blockedReason`. Vehicles use `two_thirds`; entertainment/private use `none`.

**Net (Field 7):** `outputVat - inputVat`.

**Allocation check (output side):** for each non-draft/non-cancelled standard/zero-rated invoice whose pre-VAT base ≥ `getAllocationThreshold(invoice.date)` and `documentType` is `TaxInvoice`/`TaxInvoiceReceipt`, if `allocationNumber` is empty, push its id into `invoicesMissingAllocation`. This reuses the existing dated threshold helper.

---

## 5. Reporting / period logic

- **Cadence source:** `businessSettings.vatReportingPeriod` (default `'bimonthly'`). Surface a banner suggesting `'monthly'` when trailing-12-month output base > the monthly threshold (advisor-confirm value) or when PCN874 (>500k turnover) applies.
- **Bi-monthly periods:** Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec (index 1–6). Monthly: index 1–12. `periodFor` must map dates accordingly.
- **Empty periods still count:** Osek Murshe must file even with zero activity. The view must list every period from the earliest transaction to the current period, including zero-value ones, so the user sees the filing is still due.
- **Deadlines (display only, no filing integration):** for each period, show due date = **15th** of the month after the period ends (manual) and note **19th** for online SHAAM filing; if the business is a PCN874/detailed filer, show **23rd** for payment. Reuse the deadline knowledge from `israeli-freelancer-ops`. If the 15th/19th falls on Shabbat/חג, the real deadline shifts — out of scope to compute precisely; show the nominal date with a "verify if it lands on Shabbat/holiday" note.
- **Doch Maam field mapping** is exactly the `VatReport` fields 1–7 above. The detailed PCN874 line-by-line file is **separate and out of scope** for v1 — but the data model (per-invoice number, date, base, VAT, counterparty `clientIdNumber`, `allocationNumber`) already supports generating it later; note this for a follow-up.

---

## 6. UI / export

New view **`src/pages/VatReportView.tsx`** (route alongside `TaxesView`; or a tab inside Taxes). Gate it to `businessSettings.type !== 'EsekPatur'` (an Osek Patur files no VAT — show an info card instead).

- **Period selector:** dropdown of periods from `buildAllVatReports`, defaulting to the most recent closed period.
- **Doch Maam card:** the 7 fields labeled in he/en (`taxableSalesBase`, `zeroRatedSales`, `exemptSales`, `outputVat`, `taxableInputsBase`, `inputVat`, `netVat`), with net shown as "to pay" (>0) or "refund" (<0). Currency via the existing `useCurrencyFormatter`.
- **Warnings panel:** list `invoicesMissingAllocation` (links to each invoice) and a summary of `excludedInputVat` with reasons — these are the legal blockers a user must fix before filing.
- **Deadline strip:** the due dates from §5.
- **Export:** a `Download VAT report` button producing a CSV that mirrors the existing `exportToCSV` pattern in `ExpensesView` (client-side `Blob`, no backend). Columns: period, the 7 fields, plus an optional second sheet/section listing the underlying invoices and expenses (id, date, counterparty, base, vat, treatment, allocation no.) so it doubles as the accountant handoff (`israeli-freelancer-ops` Step 6 havila). File name `vat_report_<period>.csv`.

Wire the existing dead `Download report` button in `TaxesView` (lines ~143) to this, or leave Taxes for income tax and add VAT as its own nav item — implementer's choice; prefer a dedicated nav item for clarity.

---

## 7. Edge cases

- **Zero-rated exports / Eilat:** `vatTreatment: 'zero_rated'`, `taxRate: 0`. Base flows to Field 2; **input VAT on related purchases stays fully recoverable** (do not block input VAT just because the sale was 0%). Eilat-zone sales are treated as zero-rated for this purpose — flag for advisor confirmation because Eilat has its own regime nuances.
- **Exempt transactions:** `vatTreatment: 'exempt'`. Base flows to Field 3; these **do not** support input-VAT recovery on directly attributable purchases (proportional/none) — v1 keeps it simple by reporting exempt sales but not auto-adjusting input VAT; add an advisor note.
- **Refunds / credit (status `Refunded`):** the invoice already exists and is retained. For VAT it must produce a **negative** contribution. Implement: a refunded invoice contributes `-base`/`-VAT` to the period of its recognition date (accrual: its own `invoice.date`; better: the date the refund/credit note was issued — capture via a `refundedAt` timestamp if added, else use `invoice.date` and flag). The cleaner long-term model is a credit note (חשבונית זיכוי) as its own document type with a negative total; note as a follow-up. Today `updateInvoice` already excludes Refunded from `totalBilled`; the VAT calc must mirror that by netting it out, **not** dropping it (dropping would understate output VAT in the original period if reported separately).
- **Cancelled (status `Cancelled`):** excluded entirely from the VAT report (never issued to a customer as a live document / or fully voided). They are retained for numbering/audit but contribute 0.
- **Drafts:** excluded — not yet legal documents.
- **Vehicles:** `vatDeductibility: 'two_thirds'`. The UI should offer this on the expense form, ideally auto-suggested for a "Vehicle"/"Travel" category but always user-overridable.
- **Entertainment (כיבוד/אירוח):** `vatDeductibility: 'none'`.
- **Missing/invalid tax invoice or missing supplier allocation number above threshold:** input VAT not claimable — routed to `excludedInputVat`, surfaced in the warnings panel.

---

## 8. Migration / back-compat

Existing `app_data.json` files have `Expense`/`Invoice` objects without any of the new keys. Rules:

1. **No destructive migration, no schema bump.** All new fields are optional; absence is handled by defaults at read time in `vatReport.ts`. Existing files load unchanged through `fetchAppState`.
2. **Expense defaults (read-time, do not rewrite stored data blindly):**
   - `vatRate` absent → for VAT calc, treat as standard rate on the expense date **only if** the user later marks it a tax-invoice expense; otherwise `vatAmount = 0`.
   - `vatDeductibility` absent → **`'none'`** for legacy rows, so historical expenses are never silently claimed as input VAT without the user confirming. Surface a one-time "review your expenses for VAT" nudge.
   - `hasValidTaxInvoice` absent → `false` (conservative; blocks claim until confirmed).
3. **Invoice defaults:** `vatTreatment` absent → `'standard'`. This is safe: existing invoices already carry a real `taxRate` (0 for Patur, 18 otherwise), so an Osek Murshe's historical invoices map straight into Field 1/4.
4. **BusinessSettings defaults:** `vatReportingPeriod` absent → `'bimonthly'`; `vatCashBasis` absent → `false`. Add these to `DEFAULT_BUSINESS_SETTINGS` in both `FinanceContext.tsx` and `DEFAULT_STATE` in `googleDrive.ts` so new workspaces get them, mirroring how `type: 'EsekPatur'` is defaulted today. The existing load path already spreads `{ ...DEFAULT_BUSINESS_SETTINGS, ...loaded }`, so defaults apply automatically.
5. **Merge safety:** new fields live inside existing collections, so `mergeAppState`/`mergeById` (local-wins by id) handle them with no change. No new counters or singletons to max-merge.
6. **Writing back:** when the user edits an expense to add VAT info, it persists through the normal `updateExpense` → debounced `saveAppStateGuarded` path — no special migration write needed.

---

## 9. Open questions for a רו״ח

1. **Monthly-filing turnover threshold exact figure.** Skill says NIS 1,775,000 (indexed, 2026); an older source says 1,490,000 (2018). Confirm the current indexed value before using it to auto-suggest monthly filing.
2. **Cash vs accrual basis for this Osek.** Spec defaults to accrual (by invoice date). Confirm whether the business has Tax Authority permission for cash basis (changes `outputRecognitionDate`).
3. **Eilat zone** treated here as zero-rated. Confirm exact treatment and whether Eilat purchases/inputs need special handling.
4. **Exempt-sale input-VAT apportionment.** v1 reports exempt sales but does not auto-reduce input VAT proportionally. Confirm whether proportional disallowance is required for this business.
5. **Credit notes (חשבונית זיכוי).** Confirm whether refunds must be issued as a separate negative document (own gapless series) vs the current `Refunded` status flip — affects whether we add a new `DocumentType`.
6. **PCN874 applicability** (turnover > 500k from 2026). Confirm whether this Osek is in scope, which would force monthly filing, the 23rd payment deadline, and a future line-by-line export.

---

### Sources
- [Marosa — Israel bi-monthly VAT threshold](https://marosavat.com/vat-news/israel-changes-bi-monthly-vat-threshold)
- [Herzog Law — 2026 VAT & customs updates](https://herzoglaw.co.il/en/news-and-insights/overview-of-vat-and-customs-updates-effective-in-2026/)
- [gov.il — Detailed VAT reporting (PCN874)](https://www.gov.il/he/service/detailed-vat-reporting)
- [gov.il — Notice pa130725-2 (detailed reporting expansion)](https://www.gov.il/he/pages/pa130725-2)
- [amir-cpa — Detailed VAT reporting for self-employed from 2026](https://www.amir-cpa.net/post/דיווח-מפורט-למע-מ-לעצמאי-מ-2026-חובות-והקלות)
- Skills: `anthropic-skills:israeli-vat-reporting`, `anthropic-skills:israeli-freelancer-ops`
