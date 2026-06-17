# Cash-Law Compliance & Multi-Method Payments — Implementation Spec

**Audience:** `alex` (developer agent)
**Author:** Shlomit (Israeli tax/bookkeeping compliance)
**Last researched:** 2026-06-17
**Skills used:** `anthropic-skills:israeli-freelancer-ops` (Cash Law / חוק לצמצום השימוש במזומן
thresholds & enforcement) and `anthropic-skills:israeli-vat-reporting` (how קבלה / חשבונית מס קבלה
record actual receipt of payment and payment methods).

> Disclaimer: This is engineering guidance grounded in current public sources, not accounting/legal
> advice. The business owner should confirm the figures and the block-vs-warn policy with a
> רו״ח / יועץ מס before relying on them.

---

## 1. Summary

Two linked changes to the documents that **record actual receipt of payment** (קבלה = `Receipt`
and חשבונית מס-קבלה = `TaxInvoiceReceipt`):

- **(A) Limit cash deals** — enforce the Israeli Cash Law cap on the **cash component** of a
  payment for any deal where one side is a business (עוסק). A deal whose total (incl. VAT) is at or
  below the **₪6,000 threshold may be settled fully in cash**; above the threshold the cash portion
  is capped at **the lower of 10% of the transaction value or ₪6,000**. FinFlow's issuer is always an
  עוסק, so this rule applies to every receipt the app issues.
- **(B) Split a payment across multiple methods** — replace the single `paymentMethod` enum with an
  array of **payment lines** `{ method, amount }`, so a large total can be settled with
  cash + card + bank wire + digital while the cash portion stays under the legal cap. The payment
  lines must sum to the document total.

`TaxInvoice` and `TransactionInvoice` are **demand/accounting documents that do not record receipt
of money**, so they carry **no** payment lines and are **not** subject to the cash cap. Only
`Receipt` and `TaxInvoiceReceipt` get the new model.

No Drive schema bump: every new field is optional and `mergeAppState` is unchanged (see §8).

---

## 2. Regulatory basis (sources)

**Law:** חוק לצמצום השימוש במזומן, התשע״ח-2018 ("Cash Law").

**Current cash cap for a transaction with a business (עוסק)** — confirmed today, in force.
Effective **1 August 2022** (threshold reduced from ₪11,000). Let `T` = transaction price incl. VAT
and `Threshold` = ₪6,000:

- **Condition A — `T <= Threshold`:** the whole transaction may be paid in cash (cap `C = T`). The
  10% rule does **not** bite at or below the threshold — a ₪450 deal may be ₪450 cash; a ₪6,000 deal
  may be ₪6,000 cash (boundary inclusive).
- **Condition B — `T > Threshold`:** the cash portion may not exceed `C = min(T * 0.10, Threshold)`.

Worked examples: a ₪6,001 deal → at most **₪600.10** (10%); a ₪10,000 deal → at most **₪1,000**
(10%); a ₪100,000 deal → at most **₪6,000** (the absolute cap). Above the threshold the 10% rule
binds up to ₪60,000; the flat ₪6,000 binds at/above ₪60,000.

**Scope of the cap:** it limits **only the cash part**, not the whole deal — the rest may be paid by
any non-cash means (card, bank transfer, cheque, digital). This is exactly why multi-method receipts
(B) are the compliant way to handle a large total.

**Other party types (context; FinFlow's issuer is always an עוסק so the עוסק rule governs):**
- Between two private individuals (אדם שאינו עוסק, e.g. second-hand car): **₪15,000** cash limit
  (also reduced from ₪50,000 on 1 Aug 2022). Not the path FinFlow issues on.
- **Tourist** paying a business: higher ceiling (historically 5× the business cap). Out of scope for
  v1 — see Open Questions.
- **Wages, donations, loans:** capped at the same ₪6,000-class limit; **gifts** at the private-person
  limit. Out of scope (FinFlow issues sales receipts, not payroll/donation receipts).

**Enforcement / penalty (why we warn the user):** a business that receives cash over the limit is
exposed to a monetary sanction (עיצום כספי) assessed as a **percentage of the excess (non-compliant)
cash amount** — reported across sources in the ~15%–30% band historically, with the **maximum raised
toward ~40%** in the 2026 tightening. The sanction lands on **both** payer and payee, and applies to
the *excess*, not the whole deal. Treat the exact percentage as advisor-confirmable; for the in-app
message do **not** quote a percentage — state that the excess is illegal and exposes the business to
a עיצום כספי.

Sources:
- Hebrew Cash Law full text — https://www.nevo.co.il/law_html/law00/154374.htm
- Tax Authority Cash-Law simulator — https://www.misim.gov.il/gmsimmzmn/
- Globes (limit cut to ₪6,000 business / ₪15,000 private) —
  https://en.globes.co.il/en/article-legal-limits-in-israel-for-cash-payments-to-be-cut-again-1001334509
- ezCount explainer (₪6,000 OR 10%, the lower; worked examples) —
  https://www.ezcount.co.il/blog/cash-law
- Expert.co.il 2026 update (whole-deal-vs-portion framing; max sanction raised to 40%) —
  https://www.expert.co.il/חוק-מזומן-כל-מה-שצריך-לדעת-על-שימוש-בכ/
- Wikipedia (he) overview — https://he.wikipedia.org/wiki/חוק_לצמצום_השימוש_במזומן

> Note on a source conflict you may hit: some accountant pages still show the **old** ₪11,000/₪50,000
> figures and one phrased the cap as applying to "the whole deal." The current, in-force numbers are
> **₪6,000 (business) / ₪15,000 (private)** since 1 Aug 2022, and the cap is on the **cash portion**.
> Build to the Condition A / Condition B rule above (100% cash up to the ₪6,000 threshold, then
> min(10%, ₪6,000)), and make the figures config-driven (§4) so a future change is a one-line edit.

---

## 3. Data model

Add a `PaymentLine` type and an optional `paymentLines` array on `Invoice`. Keep the existing
`paymentMethod` field for back-compat (see §8). Edit `src/context/FinanceContext.tsx`.

```ts
// New — a single tendered payment of one method.
export interface PaymentLine {
  /** Stable id for React keys / row edits. */
  id: string;
  method: PaymentMethod;          // 'Cash' | 'Digital' | 'Card' | 'BankWire' (unchanged enum)
  amount: number;                 // gross ₪ tendered via this method; > 0
}

export interface Invoice {
  // ...existing fields unchanged...

  /** @deprecated by paymentLines. KEEP for back-compat: legacy single-method docs and
   *  non-payment documents (TaxInvoice/TransactionInvoice) may still set/read it. New
   *  payment-recording docs should write paymentLines instead (and may mirror the first/only
   *  method here for older readers — optional). */
  paymentMethod?: PaymentMethod;

  /** Actual receipt of payment, split by method. Present ONLY on documents that record
   *  payment: Receipt and TaxInvoiceReceipt. Sum of amounts must equal `total` (§4).
   *  Absent on TaxInvoice / TransactionInvoice. Optional for back-compat. */
  paymentLines?: PaymentLine[];
}
```

**Which document types carry payment lines:**

| DocumentType | Records receipt of payment? | `paymentLines`? | Cash cap enforced? |
|---|---|---|---|
| `Receipt` (קבלה) | Yes | **Yes** | **Yes** |
| `TaxInvoiceReceipt` (חשבונית מס-קבלה) | Yes | **Yes** | **Yes** |
| `TaxInvoice` (חשבונית מס) | No (demand only) | No | No |
| `TransactionInvoice` (חשבון עסקה) | No (pro-forma) | No | No |

Add a small predicate used by the form, validation and PDF so the rule lives in one place
(suggest `src/utils/invoiceMath.ts`):

```ts
export function recordsPayment(documentType?: DocumentType): boolean {
  return documentType === 'Receipt' || documentType === 'TaxInvoiceReceipt';
}
```

`PaymentMethod` enum, `PAYMENT_METHODS` and `PAYMENT_METHOD_LABELS` in `invoiceMath.ts` are unchanged
and reused for the per-line selector.

---

## 4. Validation rules

Make the cash cap **config-driven and date-keyed**, matching the existing `taxConfig.ts` pattern
(`getVatRate(date)`, `getAllocationThreshold(date)`). Add a `getCashLimit(date)` returning the
business-transaction parameters in force on the document's issue date:

```ts
// src/config/taxConfig.ts
export interface CashLimit {
  /** Cash threshold, ₪: deals at/below it may be 100% cash; the absolute cash cap above it. */
  flatCap: number;        // 6000 from 2022-08-01
  /** Fraction-of-deal cap above the threshold. */
  dealFraction: number;   // 0.10 from 2022-08-01
}
// Effective 2022-08-01: { flatCap: 6000, dealFraction: 0.10 }
export function getCashLimit(date: string): CashLimit { /* date-keyed lookup */ }
```

**Effective cash cap for a document** (Condition A then B; `flatCap` is the ₪6,000 threshold):

```
cashCap(total, date):
  if total <= flatCap:  return total                          // Condition A — 100% cash allowed
  else:                 return min(dealFraction * total, flatCap)  // Condition B
```

Test cases (must hold): `T=450 → 450`, `T=6000 → 6000` (boundary inclusive), `T=6001 → 600.1`,
`T=25000 → 2500`, `T=80000 → 6000` (10% would be 8000, capped at the ₪6,000 threshold).

Rules applied to a `Receipt` / `TaxInvoiceReceipt` (only when `recordsPayment(documentType)`):

1. **Lines must sum to total.** `sum(paymentLines.amount)` must equal `total` (use a ₪0.01
   tolerance for float noise). If it does not, the document is incomplete — **block save** with the
   remaining-balance message (§5/§6).
2. **Each line amount > 0.** Reject zero/negative lines (drop empty rows before validating).
3. **Cash cap.** `sum(amount where method === 'Cash')` must be `<= cashCap(total, date)`.
   - **Policy: hard block** on save when cash exceeds the cap. The excess is illegal to *receive*,
     so the app should not record a receipt that documents an unlawful cash payment.
   - The cap is recomputed live as the user edits (total and lines both feed it).
4. Documents that do **not** record payment (`TaxInvoice`, `TransactionInvoice`) skip all of the
   above; they have no `paymentLines`.

**User-facing messages** (add i18n keys; English shown, provide Hebrew too):

- Cash over cap — block (only reachable when total > ₪6,000; at/below the threshold the cap equals
  the total and can't be breached):
  `invoices.cash_over_limit` →
  EN: *"Cash is capped at {{cap}} for this receipt (10% of the total, up to ₪6,000) under the Cash
  Law. Reduce the cash amount and pay the remaining {{excess}} by card, bank transfer, or digital."*
  HE: *"לפי חוק המזומן ניתן לקבל עד {{cap}} במזומן בקבלה זו (10% מהסכום, עד ₪6,000). יש להקטין את
  סכום המזומן ולשלם את היתרה ({{excess}}) בכרטיס, העברה בנקאית או באמצעי דיגיטלי."*
- Lines don't sum — block:
  `invoices.payment_unbalanced` →
  EN: *"Payments must add up to the total. {{remaining}} still unallocated."*
  HE: *"סכום התשלומים חייב להשתוות לסך הכול. נותרו {{remaining}} לא משויכים."*

`{{cap}}`, `{{excess}}`, `{{remaining}}` are pre-formatted via `useCurrencyFormatter`.

---

## 5. Calc helpers (pure functions)

Add to `src/utils/invoiceMath.ts` (pure, unit-testable, no React):

```ts
/** Total tendered across all payment lines. */
export function sumPayments(lines: PaymentLine[]): number;

/** Total tendered specifically as cash. */
export function sumCashPayments(lines: PaymentLine[]): number;

/** The legal cash cap for a deal: total if total <= flatCap (Condition A), else
 *  min(dealFraction * total, flatCap) (Condition B). */
export function cashCapForTotal(total: number, limit: CashLimit): number;

/** total - sumPayments(lines). Positive = still to allocate; negative = over-allocated. */
export function remainingToAllocate(total: number, lines: PaymentLine[]): number;

/** Single validation entry point the form + addInvoice/updateInvoice call. */
export interface PaymentValidation {
  balanced: boolean;        // |remaining| <= 0.01
  remaining: number;
  cashCap: number;
  cashTotal: number;
  cashOverCap: boolean;     // cashTotal > cashCap + 0.01
  ok: boolean;              // balanced && !cashOverCap && every line amount > 0
}
export function validatePayments(
  total: number,
  lines: PaymentLine[],
  limit: CashLimit,
): PaymentValidation;
```

Use a `EPS = 0.01` tolerance for all equality/`>` comparisons. These helpers take `CashLimit` as a
param (caller resolves it via `getCashLimit(date)`) so they stay pure and config-agnostic.

---

## 6. UI (InvoiceFormPage.tsx)

Render a **Payments** section **only when `recordsPayment(formData.documentType)`** is true. When the
user switches the document type to `TaxInvoice`/`TransactionInvoice`, hide the section and clear
`paymentLines` from form state (so a non-payment doc never carries them).

Replace the single Payment Method `<select>` with a payment-lines editor:

- A list of rows, each: a method `<select>` (reuse `PAYMENT_METHODS` / `PAYMENT_METHOD_LABELS`) + an
  amount `<input type="number">` + a remove button. "Add payment" button appends a row.
- **Convenience default:** when the section first appears (and no lines yet), seed one line of
  `{ method: 'BankWire', amount: total }` so simple single-method receipts stay one tap. When the
  user edits `total`/items and there is exactly one line, keep that line's amount synced to `total`
  (only auto-sync the single-line case; never silently rewrite a multi-line split).
- **Live balance:** show `remainingToAllocate(total, lines)` — e.g. "Remaining to allocate: ₪X" or
  "Over by ₪X" in red.
- **Cash-cap indicator:** when a cash line exists, show the live cap
  (`cashCapForTotal(total, getCashLimit(date))`), e.g. "Max cash: ₪1,000". When `cashOverCap`, mark
  the cash row red and show the `invoices.cash_over_limit` message in an amber/red block (reuse the
  existing allocation-warning block styling around lines 384–402).
- **Submit gating:** disable the save button (and block in `handleSubmit`) while `!validation.ok`
  for a payment-recording document. Mirror the existing allocation-number defense-in-depth: even if
  the button is bypassed, `handleSubmit` must re-run `validatePayments` and refuse.

`formData` changes: drop `paymentMethod: PaymentMethod` from `InvoiceFormData`; add
`paymentLines: PaymentLine[]`. On submit, set `invoiceData.paymentLines = recordsPayment(documentType)
? cleanedLines : undefined` and `paymentMethod: undefined` for payment docs (or mirror the first
method for legacy readers — optional, see §8). For non-payment docs, leave both undefined.

When **editing** an existing invoice: if it has `paymentLines`, load them; else if it has a legacy
`paymentMethod`, seed one line `{ method, amount: total }` (the §8 migration, applied lazily in the
form too).

---

## 7. PDF (InvoiceTemplate.tsx)

Currently renders a single "Payment Method" line (≈ lines 82–86). Change so that on a document that
records payment:

- If `invoice.paymentLines?.length`, render a small **Payment** block listing each line:
  `{methodLabel} — {formatCurrency(amount)}`, one per row, in the metadata column. Keep numbers in
  the existing `<Ltr>` wrapper for correct RTL capture.
- For a single line, this naturally reads like the old single-method display.
- Back-compat: if `paymentLines` is absent but `paymentMethod` is present, render the old single line
  exactly as today (keep that branch).
- On `TaxInvoice`/`TransactionInvoice`, render no payment block (they don't record receipt).

No total/VAT math changes — `computeTotals` and the totals block stay as-is. (Optional nicety: assert
in dev that `sumPayments(paymentLines) === invoice.total` so a malformed doc is caught before print.)

---

## 8. Migration / back-compat

- **No schema bump; `mergeAppState` and the Drive store are unchanged.** All new fields
  (`paymentLines`, `PaymentLine`) are optional.
- **Existing invoices** keep their `paymentMethod`. They are read as a single payment line of the
  full total **on demand** (lazy, at read time in the form and PDF) — do **not** run a bulk rewrite
  of the invoices array (avoids a mass Drive write and respects the issued-document retention rule).
  Helper:
  ```ts
  export function paymentLinesOf(inv: Pick<Invoice,'paymentLines'|'paymentMethod'|'total'>): PaymentLine[] {
    if (inv.paymentLines?.length) return inv.paymentLines;
    if (inv.paymentMethod) return [{ id: 'legacy', method: inv.paymentMethod, amount: inv.total }];
    return [];
  }
  ```
- **New payment docs** write `paymentLines`. Optionally also mirror the first/only method into
  `paymentMethod` so any older reader (or an un-migrated PDF path) still shows something; not
  required.
- A legacy single-method invoice whose lone implied line happens to be **cash over the current cap**
  is **not** retroactively blocked (it was already issued and is retained). Only **new** saves /
  edits that touch the payments section are validated. This matches the existing pattern where
  issued documents are immutable/retained.
- `addInvoice` / `updateInvoice` in `FinanceContext.tsx` should call `validatePayments` (resolving
  `getCashLimit(invoice.date)`) for payment-recording documents and refuse to persist an invalid set
  — defense-in-depth behind the form gating.

---

## 9. Edge cases

- **Total changes after lines entered:** recompute cap and balance live; if a multi-line split no
  longer sums, surface the unbalanced message rather than silently auto-adjusting.
- **Rounding:** VAT can make totals non-integer; use `EPS = 0.01` everywhere and round line inputs to
  agorot. Sum check and cap check both use the tolerance.
- **Zero / negative / empty rows:** strip rows with empty or `0` amount before validating; reject
  negatives.
- **Small deal at/below ₪6,000 (Condition A):** the whole receipt may be cash — a ₪3,000 receipt
  caps cash at ₪3,000, a ₪450 receipt at ₪450. The 10% rule does **not** apply here. Make sure the
  UI shows the *computed* cap, not a hardcoded ₪6,000 and not 10% of small totals.
- **10% rule above the threshold (Condition B):** between ₪6,000 and ₪60,000 the binding cap is 10%
  of total — e.g. a ₪25,000 receipt caps cash at ₪2,500; at/above ₪60,000 the flat ₪6,000 binds.
- **Status interplay:** a `Draft` may be saved with unbalanced/partial payments (it's not yet a legal
  document) — consider allowing save-as-draft to bypass the balance block but still warn. Confirm the
  desired Draft behavior with product; default to **enforcing only on non-Draft** save.
- **Document-type switch clears lines:** switching to `TaxInvoice`/`TransactionInvoice` must clear
  `paymentLines`; switching back re-seeds the default single line.
- **Refund / Cancelled:** no change to payment-line logic; totals handling stays in `updateInvoice`.

---

## 10. Open questions for a רו״ח

1. **Block vs. warn for cash-over-cap.** This spec hard-blocks. Confirm the business is comfortable
   that FinFlow will refuse to *record* a cash receipt above the cap (the alternative — record-but-
   warn — documents an unlawful payment). Recommended: block on non-Draft.
2. **Exact עיצום כספי percentage and 2026 change.** Sources put it in the 15%–30% band with a
   maximum raised toward ~40% in 2026, on the *excess* cash. We deliberately do **not** print a
   percentage in-app. Confirm the current figure if the business wants it shown.
3. **Tourist exception.** A higher cash ceiling exists for tourists paying a business. FinFlow has no
   "customer is a tourist" flag today. Out of scope for v1 — confirm whether any clients are tourists
   before relying on the standard ₪6,000/10% cap for those receipts.
4. **Cheques.** The Cash Law also restricts open/endorsed cheques separately from "cash." FinFlow's
   methods are Cash/Digital/Card/BankWire with no cheque type — confirm cheques are out of scope or
   add a `Cheque` method with its own rules later.
5. **"Transaction value" vs document total.** We treat the receipt `total` as the transaction price
   for the 10% rule. If a single transaction spans multiple receipts/instalments, the cap is on the
   *whole transaction*, not each receipt — confirm whether multi-receipt deals occur and need
   aggregate tracking.
