# FinFlow — Israeli Tax & Bookkeeping Compliance Report

**Last researched:** 2026-06-16
**Re-verified:** 2026-06-17 (against commit `a158642` on `main`)
**Overall verdict:** ⚠️ **Substantially improved — but still NOT a legal tax-document issuer for `EsekMorshe`/`Company`.** Commit `a158642` closed the document-type, numbering, mandatory-field, normative-deduction and estimate-labelling gaps and centralized all date-sensitive figures into `src/config/taxConfig.ts`. The one remaining **Critical** blocker is the allocation number (מספר הקצאה): the data model and integration seam now exist, but no number is ever obtained or printed, so any tax invoice ≥ 5,000 ₪ pre-VAT from an Esek Morshe/Company is still unusable for the buyer's input-VAT credit. `EsekPatur` is effectively compliant.

> **Disclaimer:** This report is engineering/compliance *guidance* produced from live research on the dates above. It is not accounting or legal advice. The business owner must confirm every figure and conclusion with a licensed רואה חשבון / יועץ מס before relying on it. Thresholds, rates and dates change frequently — re-verify each run.

---

## 1. Regulation re-verification (confirmed 2026-06-17)

All figures below were re-confirmed live today against primary/reputable sources.

| Topic | Current value (confirmed 2026-06-17) | Effective date | Source |
|---|---|---|---|
| Standard VAT rate | **18%** (2026 budget kept it at 18%; the proposed rise to 19% was dropped) | 2025-01-01 | vatcalc / vatupdate |
| Allocation number (מספר הקצאה) threshold | **5,000 ₪ before VAT** | **2026-06-01** (10,000 from 2026-01-01; 20,000 in 2025; 25,000 in 2024) | greeninvoice / ACI |
| Allocation number applies to | Tax invoice + tax-invoice-receipt issued by **Esek Morshe / partnership / company**; **NOT** Esek Patur (issues receipts only) | current | greeninvoice / ACI |
| 2026 bracket widening (Amendment 288) | 20% band → up to **19,000 ₪/mo (228,000 ₪/yr)**; 31% band → up to **25,100 ₪/mo (301,200 ₪/yr)** | Retroactive to **2026-01-01**, paid from March 2026 | JPost / ynet |
| Income tax top marginal rate (incl. 3% surtax) | **50%** above 721,560 ₪/yr | 2026 | JPost / pwc |
| Cash Law — max cash with a dealer | **6,000 ₪** | current | invoice4u / nevo |
| Record retention — books & vouchers | **7 years** | current | (carried from 2026-06-16 research) |

**Changes since the 2026-06-16 baseline:**
- **Income-tax brackets RESOLVED (was Open Question 2 / Gap 6).** Amendment 288 widened the 20% band to 228,000 ₪/yr and the 31% band to 301,200 ₪/yr, retroactive to 2026-01-01. **The brackets now hardcoded in `src/config/taxConfig.ts` (228,000 and 301,200) match these widened figures exactly** — so they are correct for 2026, despite the in-code comment still warning they "predate the widening." That comment is now stale and should be removed; the numbers themselves are right. (Note: some secondary sources, e.g. protocol.co.il, still display the pre-widening 193,800/269,280 base — those are out of date.)
- VAT confirmed to remain 18% for 2026 (the 19% budget proposal was dropped on 2025-12-05).

---

## 2. Compliance matrix (re-verified against `a158642`)

| # | Regulation | Applies to | What the code now does (file) | Compliant? | Remaining gap |
|---|---|---|---|---|---|
| 1 | Allocation number required on tax invoices ≥ 5,000 ₪ pre-VAT, else buyer loses input-VAT credit | EsekMorshe, Company | `Invoice.allocationNumber?` field added; dated `getAllocationThreshold()` returns 5,000 (2026-06-01); `addInvoice` has a documented integration *seam* but **never obtains a number**, and `InvoiceTemplate.tsx` never prints one (`FinanceContext.tsx:405-426`, `taxConfig.ts:49-53`) | ❌ **Critical** | Actually call the ITA חשבוניות-ישראל API, store the number, **print it on the PDF**, and block/flag issuance when missing. No threshold check or warning exists yet either. |
| 2 | VAT rate must be a maintained, dated value (18%) | EsekMorshe, Company | Resolved from `getVatRate(invoice.date)` by issue date; no longer hardcoded (`InvoiceFormPage.tsx:18,91,134`, `taxConfig.ts:39-42`) | ✅ | — |
| 3 | Mandatory fields: seller ע.מ/ח.פ, customer name + ID, doc-type wording, VAT breakdown, מקור/העתק | All | `Client.idNumber?` added and captured (`ClientsView.tsx`); snapshotted onto invoice as `clientIdNumber` at issue time; template renders seller ID, customer name + ID, VAT breakdown, and מקור/העתק via `copyType` (`InvoiceTemplate.tsx:14,52-55,92-96`) | ✅ | Minor: customer ID is optional (correct for private consumers); template defaults to "Original" with no copy-printing flow wired to a "duplicate" button — acceptable. |
| 4 | Gapless, sequential numbering, unique per legal doc type | All | Persisted per-type counters (`DocCounters`) in `businessSettings.docCounters`; `allocateInvoiceId` increments the stored counter (never array `max+1`); each type has its own prefix series INV/RCPT/INVR/TXN; seeded once via `seedDocCounters`; increment persisted through the optimistic-concurrency save guard (`invoiceMath.ts:36-108`, `FinanceContext.tsx:414-426`) | ✅ | TaxInvoice/TaxInvoiceReceipt/TransactionInvoice now have **separate** series (was a single `INV-` series). Confirm with advisor that a per-type continuous counter satisfies §the bookkeeping directives for each document book. |
| 5 | Esek Patur may not issue חשבונית מס; 0% VAT; קבלה + חשבון עסקה only | EsekPatur | Dropdown restricted to `['Receipt','TransactionInvoice']`; tax rate forced to 0; defense-in-depth re-clamps documentType on submit; legacy Patur tax invoices coerced to Receipt (`InvoiceFormPage.tsx:48-54,71-73,176-178`) | ✅ | — |
| 6 | 2026 progressive brackets (post Amendment 288 widening) | All (owner est.) | Dated bracket table resolved by date in `taxConfig.ts:70-83`; values (228,000 / 301,200) **match the widened 2026 figures** | ✅ | Cosmetic only: the code comment claiming the numbers "predate the widening" is now false — remove it. Lower bands (84,120 / 120,720 / 560,280 / 721,560) consistent with 2026 sources. |
| 7 | Tax estimate must reflect real liability or be clearly labelled | All | `TaxesView.tsx:34-35,55-57` shows estimate labelled "Income tax estimate only — excludes ביטוח לאומי / מס בריאות" (`en.json:217`); amber warning retained | ✅ (as a labelled estimate) | Still does not *compute* NI/health/מקדמות — acceptable only because it is explicitly labelled income-tax-only. Adding an NI/health estimate remains a future enhancement. |
| 8 | 30% normative (Esek Zair) deduction only for qualifying small businesses, never a Company | EsekPatur / small Esek Zair | Gated by `businessSettings.type !== 'Company'`; a Company deducts actual tracked expenses (`TaxesView.tsx:27-33`) | ⚠️ | Type gate is correct, but the **qualifying-income ceiling** that also limits the 30% is not applied — a high-turnover sole trader would still get the deduction. Advisor-blocked (Open Q3). |
| 9 | Cash Law transaction limit (6,000 ₪) | All | No payment-method capture or cash-limit warning anywhere | ⚠️ | Unchanged — add a warning when a cash-paid invoice/expense exceeds 6,000 ₪. |
| 10 | Retention 7 years; no destruction of issued docs | All | `deleteInvoice` now **soft-cancels** issued documents (sets status `Cancelled`) and only hard-deletes `Draft`s, preserving the gapless series (`FinanceContext.tsx:512-539`) | ⚠️ | Invoices handled correctly. **Expense receipts:** `deleteExpense` still hard-removes the receipt file from Drive (no retention guard) — partial fix. |
| 11 | VAT/income on cash basis for service providers | EsekMorshe, Company | Revenue still counted only on `status==='Paid'` (`TaxesView.tsx:13-15`) | ✅ (incidental) | Basis still implicit; confirm with advisor. |

---

## 3. Remaining gap details (functional change requests)

### Gap 1 — Allocation number (מספר הקצאה) — CRITICAL, STILL OPEN
**Rule:** From **2026-06-01**, any tax invoice / tax-invoice-receipt for a transaction **≥ 5,000 ₪ before VAT** must carry an allocation number obtained in real time from the ITA "חשבוניות ישראל" system; without it the buyer cannot deduct input VAT (greeninvoice; ACI). Esek Patur is exempt (issues receipts only).
**Status after `a158642`:** Data model is ready (`Invoice.allocationNumber?`), the threshold is correctly dated (5,000 from 2026-06-01) in `taxConfig.ts`, and `addInvoice` documents exactly where the call belongs — but **no allocation number is ever requested, stored, or printed**, and there is no threshold check that warns or blocks. So the legal outcome is unchanged from the baseline: a ≥5,000 ₪ Esek Morshe/Company tax invoice is still non-deductible for the buyer.
**Required behavior:** (1) When a TaxInvoice/TaxInvoiceReceipt's pre-VAT subtotal ≥ `getAllocationThreshold(date)`, obtain a number from the ITA API before finalizing; (2) store it in `allocationNumber`; (3) render it on the PDF in `InvoiceTemplate.tsx`; (4) if it cannot be obtained, block issuance or clearly mark the invoice non-deductible. As an interim non-API safeguard, at minimum **warn** the user and allow manual entry of a number they obtained directly from the ITA portal, then print it.
**Architecture flag:** Real-time ITA access needs authenticated server-side integration — incompatible with the no-backend, Drive-only model. Still the top open question.
**Business types:** EsekMorshe, Company. Not EsekPatur.

### Gap 8 — 30% normative deduction missing the income ceiling — ⚠️
**Rule:** The 30% normative ("Esek Zair") deduction applies to qualifying small businesses under a turnover/income ceiling; it does not apply to a Company, nor to a sole trader above the ceiling.
**Status:** Type gate is now correct (never applied to `Company`). The **income ceiling** is still not enforced, so a high-turnover Esek Patur/Morshe sole trader gets the deduction they may not be entitled to, understating tax.
**Required behavior:** Add the qualifying-income ceiling check once the 2026 figure is confirmed with an advisor.

### Gap 9 — Cash Law warning — ⚠️ (unchanged)
**Rule:** Cash with a dealer capped at 6,000 ₪.
**Status:** No payment-method capture or warning.
**Required behavior:** When recording a cash-paid invoice/expense over 6,000 ₪, warn the user.

### Gap 10 — Expense-receipt retention — ⚠️ (partially fixed)
**Rule:** Books, invoices and receipts retained 7 years; digital storage permitted.
**Status:** Invoices are now retained via soft-cancel. **Expense receipts are still hard-deleted from Drive** by `deleteExpense` — defeats retention for the expense side.
**Required behavior:** Block/soft-retain deletion of expense receipts that back a filed period, or warn and archive rather than delete.

### Cosmetic — stale bracket comment
`taxConfig.ts:62-69` and `:11-12` warn the brackets "predate the 2026-03-30 widening." That is no longer true — the values (228,000 / 301,200) match the widened figures. Remove the misleading comment so a future maintainer doesn't "correct" correct numbers.

---

## 4. Open questions / needs a tax advisor
1. **Allocation-number API & architecture** — unchanged; the real-time מספר הקצאה integration needs authenticated server-side ITA access that the Drive-only model can't securely hold. This is the gating decision for tax-invoice support to Esek Morshe/Company.
2. ~~Exact 2026 bracket figures~~ **RESOLVED** — Amendment 288 widened figures (228,000 / 301,200) confirmed and already in code.
3. **Esek Zair income ceiling** gating the 30% deduction for 2026 (distinct from the ~122,833 ₪ VAT-exemption ceiling) — still unconfirmed.
4. **NI / health rates** for the self-employed 2026 — not yet computed (estimate is labelled income-tax-only, which is acceptable).
5. **Per-document-type numbering** — confirm a separate continuous counter per type (INV/RCPT/INVR/TXN) satisfies the bookkeeping directives' "book per document type" rule, and that חשבון עסקה (TXN) need not share the receipt series.

---

## Sources
- VAT 18% (2026 kept): https://www.vatcalc.com/vat/israel-vat-rise-to-19-jan-2026-proposal/ , https://www.vatupdate.com/2025/12/10/israel-approves-2026-budget-vat-stays-at-18-expands-exemptions-eases-bank-entry-rules/
- Allocation number / threshold (25k→20k→10k→5k, before VAT, Patur exempt): https://www.greeninvoice.co.il/magazine/israel-invoice/ , https://aci.org.il/knowledge/allocation-number-input-tax-2026/
- 2026 bracket widening (Amendment 288, 228k/301k, retroactive to 2026-01-01): https://www.jpost.com/business-and-innovation/banking-and-finance/article-892194 , https://www.ynetnews.com/business/article/rkpl6m11n11l
- Income tax brackets / top rate 50%: https://taxsummaries.pwc.com/israel/individual/significant-developments , https://protocol.co.il/income-tax-rates/
- Cash Law 6,000 ₪: https://www.invoice4u.co.il/blog/%D7%97%D7%95%D7%A7-%D7%94%D7%9E%D7%96%D7%95%D7%9E%D7%9F/ , https://www.nevo.co.il/law_html/law00/154374.htm
