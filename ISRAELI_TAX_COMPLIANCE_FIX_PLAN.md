# FinFlow — Israeli Tax Compliance Fix Plan

Derived from `ISRAELI_TAX_COMPLIANCE_REPORT.md` (researched 2026-06-16). This plan converts each gap into concrete engineering work, ordered by legal severity and dependency. File references are to the current codebase.

> **Sequencing principle:** ship the data-model + numbering + mandatory-fields foundation first (everything else depends on it), then the per-business-type guards, then the allocation-number integration (which needs an architecture decision), then the estimate/retention refinements.

---

## Decisions needed before coding

These block specific phases and need the owner / a tax advisor:

1. **Allocation-number (מספר הקצאה) architecture** — the ITA "חשבוניות ישראל" API needs authenticated server-side access, which the current no-backend Drive-only model cannot hold securely. Choose: (a) add a minimal backend/serverless proxy, (b) integrate a licensed provider (Green Invoice / EZcount / Tranzila) that already holds ITA credentials, or (c) defer tax-invoice support for Esek Morshe/Company. **Phase 4 is blocked until this is decided.**
2. **Exact 2026 brackets** post the 2026-03-30 widening — get final figures from ITA/Knesset for Phase 5.
3. **Esek Zair income ceiling** that gates the 30% normative deduction (2026) — for Phase 3.
4. **NI / health (ביטוח לאומי / מס בריאות) rates** for self-employed 2026 — for Phase 5.

I can proceed on Phases 1–3 and 6 without these; 4 and 5 need the answers above.

---

## Phase 1 — Foundation: data model, numbering, mandatory fields
*Severity: Critical · No external dependencies · Do first.*

### 1a. Gapless, per-type numbering (Gap 4)
- **Problem:** `nextInvoiceId` in [invoiceMath.ts](src/utils/invoiceMath.ts:37) derives the next number as `max(existing)+1`, and TaxInvoice/TaxInvoiceReceipt/TransactionInvoice all share the `INV-` series. Deletes or multi-device sync races can reuse, skip, or duplicate numbers; distinct legal doc types share one series.
- **Change:**
  - Add a persisted per-document-type counter to `BusinessSettings` (e.g. `docCounters: Record<DocumentType, number>`) in [FinanceContext.tsx](src/context/FinanceContext.tsx:10), seeded from current max on migration.
  - Rewrite `nextInvoiceId` to read & increment the persisted counter instead of scanning the array; give each legal doc type its own prefix/series.
  - Never reuse a number after deletion (pairs with 1c + Phase 6 cancel flow).
  - Guard against the Drive concurrency race — the counter increment must go through the same optimistic-concurrency save guard already added in commit `71e1553` (see [[project_multidevice_sync]]).
- **Touches:** `invoiceMath.ts`, `FinanceContext.tsx` (`addInvoice` at line 363, `BusinessSettings`, migration on load ~line 223).

### 1b. Customer tax ID + mandatory fields (Gap 3)
- **Problem:** `Client` ([FinanceContext.tsx:31](src/context/FinanceContext.tsx:31)) has no tax-ID field; invoices never carry the customer's ע.מ/ח.פ; PDF has no מקור/העתק (original/copy) marking.
- **Change:**
  - Add optional `idNumber?: string` to `Client`; capture it in the client form ([ClientsView.tsx](src/pages/ClientsView.tsx)).
  - Persist the customer name **and** ID onto the `Invoice` at issue time (snapshot, so later client edits don't mutate issued docs).
  - Render seller name+ID, customer name+ID, doc-type wording, VAT breakdown, and an original/copy (מקור/העתק) label in [InvoiceTemplate.tsx](src/services/pdf/InvoiceTemplate.tsx).
- **Touches:** `FinanceContext.tsx` (`Client`, `Invoice`), `ClientsView.tsx`, `InvoiceTemplate.tsx`.

### 1c. VAT rate as dated config (Gap 2)
- **Problem:** VAT `18` is hardcoded in [InvoiceFormPage.tsx:74,115](src/pages/InvoiceFormPage.tsx:115); correct today but breaks silently on the next rate change.
- **Change:** Create a single dated config (e.g. `src/config/taxConfig.ts`) holding VAT rate by effective date and the allocation-number threshold by effective date; resolve the rate by invoice date. Replace the hardcoded literals.
- **Touches:** new `taxConfig.ts`, `InvoiceFormPage.tsx`, `invoiceMath.ts`.

---

## Phase 2 — Business-type document guards
*Severity: ⚠️ High · Depends on Phase 1 config.*

### 2a. Esek Patur document-type restriction (Gap 5)
- **Problem:** The doc-type `<select>` in [InvoiceFormPage.tsx:278-287](src/pages/InvoiceFormPage.tsx:278) exposes `TaxInvoice` and `TaxInvoiceReceipt` to Esek Patur users, who legally may not issue a חשבונית מס.
- **Change:** When `businessSettings.type === 'EsekPatur'`, restrict the dropdown to `Receipt` and `TransactionInvoice` (חשבון עסקה) only, and keep VAT at 0%. (The `isPatur` flag already exists at line 40.)
- **Touches:** `InvoiceFormPage.tsx`.

---

## Phase 3 — Tax-estimate correctness
*Severity: ❌/⚠️ · Depends on advisor figures (Decisions 3 & 4).*

### 3a. Gate the 30% normative deduction (Gap 8)
- **Problem:** [TaxesView.tsx:20](src/pages/TaxesView.tsx:20) applies `NORMATIVE_DEDUCTION_RATE` (0.30) to every workspace including Company — understating tax.
- **Change:** Apply the 30% deduction only for `EsekPatur`/qualifying small Esek Zair under the income ceiling; for `Company`, deduct actual expenses only. Read `businessSettings.type`.
- **Touches:** `TaxesView.tsx`, `utils.ts`.

### 3b. Estimate scope labeling (Gap 7)
- **Problem:** The "tax liability" figure in `TaxesView.tsx` ignores ביטוח לאומי / מס בריאות / מקדמות.
- **Change:** Either add NI/health estimation (needs Decision 4) or, as a minimum, relabel the figure "income tax only — excludes ביטוח לאומי / מס בריאות" and keep the estimate disclaimer.
- **Touches:** `TaxesView.tsx`, i18n strings.

---

## Phase 4 — Allocation number (מספר הקצאה)
*Severity: ❌ Critical · BLOCKED on Decision 1 (architecture).*

- **Rule:** From 2026-06-01, any tax invoice ≥ 5,000 ₪ before VAT must carry a real-time allocation number from ITA, else the buyer loses input-VAT credit. Threshold is ratcheting down — keep it in dated config (Phase 1c).
- **Change once architecture is chosen:**
  - Add `allocationNumber?: string` to `Invoice`.
  - Before finalizing a `TaxInvoice`/`TaxInvoiceReceipt` at/above the current threshold, call the chosen ITA path, store the number, print it on the PDF.
  - Block issuance (or mark non-deductible) if no number can be obtained.
- **Applies to:** EsekMorshe, Company. Not EsekPatur.
- **Touches:** `Invoice` model, `addInvoice`, `InvoiceTemplate.tsx`, new integration module + backend/provider.

---

## Phase 5 — Brackets re-verification
*Severity: ⚠️ · BLOCKED on Decision 2.*

- **Problem:** Hardcoded brackets in [utils.ts:21-29](src/utils/utils.ts:21) labelled "2026" predate the 2026-03-30 widening of the 20%/31% bands.
- **Change:** Re-verify the 20%/31% limits against the final ITA publication, correct them, and date the bracket table (move into `taxConfig.ts` from Phase 1c so it's maintained in one place).
- **Touches:** `utils.ts` / `taxConfig.ts`.

---

## Phase 6 — Retention & cash-law guards
*Severity: ⚠️ · Depends on Phase 1 numbering.*

### 6a. No hard-delete of issued documents (Gap 10)
- **Problem:** `deleteInvoice` ([FinanceContext.tsx:447](src/context/FinanceContext.tsx:447)) hard-removes issued docs; `deleteExpense` ([line 302](src/context/FinanceContext.tsx:302)) deletes the Drive receipt file — both defeat 7-year retention and gapless numbering.
- **Change:** Replace hard-delete of issued tax documents with a cancel / credit-note flow (status `Cancelled`/`Refunded` already partially exists); soft-retain ≥7 years; warn before receipt deletion. Drafts may still be deleted.
- **Touches:** `FinanceContext.tsx`, `InvoicesView.tsx`, `ExpensesView.tsx`.

### 6b. Cash-law warning (Gap 9)
- **Problem:** No payment-method capture or cash-limit warning (limit 6,000 ₪ with a dealer).
- **Change:** Capture payment method on invoice/expense; warn when a cash payment exceeds the limit. Lower priority — advisory only.
- **Touches:** `InvoiceFormPage.tsx`, `ExpensesView.tsx`, models.

---

## Suggested execution order

| Order | Phase | Why |
|---|---|---|
| 1 | 1a, 1b, 1c | Foundation everything else builds on; pure code, no advisor needed |
| 2 | 2a | Quick guard, prevents illegal Patur invoices |
| 3 | 6a | Protects numbering integrity from Phase 1 |
| 4 | 3a | Fixes active under-reporting of tax |
| 5 | 3b, 5 | Estimate accuracy (needs advisor figures) |
| 6 | 4 | Largest effort, blocked on architecture decision |
| 7 | 6b | Advisory nicety |

---

## What I'd build first if you say "go"

Phase 1 (1a + 1b + 1c) as a single branch: dated `taxConfig.ts`, persisted per-type gapless counter wired through the existing concurrency guard, `Client.idNumber` + invoice field snapshotting, and the PDF mandatory-fields/מקור-העתק rendering. That clears two of the three Critical gaps and unblocks Phases 2, 3, and 6.
