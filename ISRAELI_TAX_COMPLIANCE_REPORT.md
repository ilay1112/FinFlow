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
| 9 | Cash Law transaction limit (6,000 ₪) | All | **Now implemented for payment-recording documents** (Receipt / TaxInvoiceReceipt): dated `getCashLimit()`, `min(₪6,000, 10%)` cap on the cash portion, multi-method split, hard block on over-cap (`taxConfig.ts:99-167`, `invoiceMath.ts:69-166`, `FinanceContext.tsx:507-571`, `InvoiceFormPage.tsx:172-329`). See Cash-Law verification section. | ✅ | Expenses still capture no payment method, so a cash-paid expense over the cap is not flagged (out of this feature's scope). |
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

### Gap 9 — Cash Law warning — ✅ implemented for receipts (see verification section)
**Rule:** Cash with a dealer capped at the lower of 6,000 ₪ or 10% of the deal.
**Status:** Implemented on payment-recording documents via the multi-payment feature (verified below). **Expenses** still capture no payment method, so a cash-paid *expense* over the cap is not flagged — out of this feature's scope.
**Required behavior (residual):** Optionally extend a cash-over-cap warning to expense capture.

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

---

## Operational Readiness (VAT / Annual Return / Freelancer Ops)

**Researched:** 2026-06-17. **Scope:** can FinFlow's *current data and screens* drive the three core
operational workflows an Israeli freelancer/small business runs each year — the periodic VAT report
(דוח מע״מ), the annual income-tax return (1301 / 1214), and ongoing freelancer ops (deadline tracking
+ osek-patur ceiling monitoring + accountant handoff)?

> **Skill-tool note (transparency):** The task asked me to invoke three Anthropic skills
> (`anthropic-skills:israeli-vat-reporting`, `israeli-tax-returns`, `israeli-freelancer-ops`). **These
> skills are not installed in this environment** — there is no Skill tool exposed to me and no matching
> `SKILL.md` on disk (the only skills present are the Redux Toolkit ones under `node_modules`). I could
> not invoke them and have not fabricated their output. Each section below states this explicitly,
> applies the domain procedure from first principles against live-verified rules, and grounds every
> judgement in the actual FinFlow code. If/when the skills are installed, re-run to follow their exact
> procedures.

> **Disclaimer:** Guidance only, not accounting/legal advice — confirm with a רו״ח / יועץ מס.

### Live-verified figures used in this section (confirmed 2026-06-17)

| Parameter | Value | Effective / notes | Source |
|---|---|---|---|
| Osek-patur annual turnover ceiling | **122,833 ₪** | 2026 calendar year (turnover, not profit) | greeninvoice; kolzchut |
| VAT reporting frequency split | **bi-monthly** if turnover ≤ **1,775,000 ₪**/yr; **monthly** above | from 2026-01-01 | h-erp; ucan2 |
| VAT report + payment deadline | **15th** of the month after the period (detailed report **23rd**) | current | kolzchut; ucan2 |
| Income-tax advances (מקדמות) | periodic (usually bi-monthly) % of turnover, same calendar as VAT | current | kolzchut |
| Annual return 1301 (individual) deadline | **online: 2026-06-30**; manual: **2026-05-29** (for tax year 2025) | ITA gov.il | gov.il |
| Annual return 1214 (company) deadline | **2026-07-31** online (for tax year 2025) | ITA gov.il | gov.il |
| Standard VAT rate | 18% | since 2025-01-01 | (see §1) |

> **CORRECTION (2026-06-17, VAT verification run):** The monthly-vs-bi-monthly split above (≤1,775,000 ₪)
> is **wrong**. The statutory figure in **Section 67(a)(2) of the VAT Law / VAT Regulations reg. 20** is
> **NIS 1,500,000** (one CPA source cites a lightly-indexed 1,502,000). 1,775,000 has no basis I could
> confirm today. See the verification section below — this figure is also wrong in `taxConfig.ts`.

---

### A. VAT reporting — דוח מע״מ

*Skill requested: `anthropic-skills:israeli-vat-reporting` — **not installed, could not invoke.** Procedure below applied from expertise.*

**What a Doch Maam requires.** Each period (monthly or bi-monthly per the turnover split above) the
business files: **(1) output VAT (מע״מ עסקאות)** = VAT collected on sales in the period, **(2) input
VAT (מע״מ תשומות)** = VAT paid on business purchases/expenses in the period, **(3) net = output −
input** remitted to (or refunded by) the ITA, by the 15th of the following month. Reporting is on an
**accrual basis for most businesses** (by invoice date), not cash. Osek patur files **no** periodic
VAT report at all — it files a single annual turnover declaration (הצהרת מחזור) instead.

**Status now SUPERSEDED for EsekMorshe/Company by the VAT implementation in the working tree** — see
the verification section appended below (2026-06-17). The osek-patur "no periodic VAT" point still
holds and is correctly handled (the new VatReportView excludes Patur).

**Original baseline gaps (closed by the new VAT feature, retained for history):**

1. **No VAT period concept and no VAT report/screen anywhere.** — *Now addressed:* `vatReport.ts` +
   `VatReportView.tsx` add period bucketing, output/input netting, and a Doch Maam screen + CSV export.
2. **Output VAT not separable from invoice data.** — *Now addressed:* `vatReport.ts` recomputes the
   net/VAT split via `computeTotals`.
3. **Expenses carry no VAT field.** — *Now addressed:* `Expense` gained `netAmount`/`vatAmount`/
   `vatRate`/`vatDeductibility`/`hasValidTaxInvoice`/`supplierAllocationNumber`.
4. **Accrual vs cash mismatch.** — *Now addressed:* output VAT defaults to accrual (invoice date),
   with an opt-in cash-basis path.
5. **No osek-patur annual turnover declaration.** Still unaddressed (out of VAT-feature scope).

---

### B. Annual income-tax return — 1301 (individual) / 1214 (company)

*Skill requested: `anthropic-skills:israeli-tax-returns` — **not installed, could not invoke.** Procedure below applied from expertise.*

**What the annual return needs from the year's data.** Form **1301** (individual/sole trader,
incl. EsekPatur & EsekMorshe) needs the full-year **business revenue**, **recognized expenses** (or the
osek-zair 30% normative deduction where eligible), the resulting **net business income**, **income-tax
advances already paid during the year (מקדמות)** to credit against the liability, plus NI/health and
other income lines. Form **1214** (Company) needs the company's P&L → taxable income at the **corporate
rate (23%)**, advances paid, and is a distinct filing from the shareholder's personal 1301. Deadlines
for tax year 2025: 1301 online **2026-06-30**, 1214 online **2026-07-31**.

**What FinFlow can supply.** Partially, and only the income side:
- **Revenue and a tax estimate exist** but are *paid-basis* and *income-tax-only*
  (`TaxesView.tsx:13-15,34-38`). The annual return is generally **accrual-based** for the
  self-employed, so a paid-only revenue figure will not match the return without adjustment.
- **Expense total exists** and feeds a Company's actual-expense deduction; the 30% normative deduction
  is correctly gated to non-Company types (`TaxesView.tsx:27-33`).

**What FinFlow cannot supply — gaps:**
1. **מקדמות (advance payments) are tracked nowhere.** There is no field, screen, or data model for
   income-tax advances paid through the year — so the app can neither remind the user to pay them nor
   credit them in the annual reconciliation. The on-screen estimate is therefore a gross liability that
   ignores what's already been paid, which overstates the balance due. **Critical** for the return's
   accuracy. (No reference in `FinanceContext.tsx` / `TaxesView.tsx`.)
2. **No Company corporate-tax path.** For `Company`, `calculateProgressiveTax` runs the **individual**
   progressive brackets (`utils.ts:21-42`, `taxConfig.ts:68-81`) — a company pays a **flat 23% corporate
   tax**, not progressive personal rates. The 1214 estimate is therefore wrong for the Company type; the
   app conflates the company return with the owner's personal return.
3. **No 1301/1214 export or year-scoped P&L.** `TaxesView` has a "Download report" button
   (`TaxesView.tsx:143`) with **no handler wired** — it does nothing. There is no per-tax-year
   revenue/expense breakdown a user or accountant could map onto return line items.
4. **No NI / מס בריאות** computation (acknowledged and labelled in §2 Gap 7) — these are return inputs
   the app explicitly doesn't produce.

**Top annual-return gaps:** (a) **no mikdamot tracking** → liability overstated and no payment
reminders; (b) **Company uses individual brackets instead of 23% corporate** → wrong 1214 estimate;
(c) **no year-scoped P&L / return export** (the download button is dead).

---

### C. Freelancer ops — deadlines, osek-patur ceiling, accountant handoff (חבילה)

*Skill requested: `anthropic-skills:israeli-freelancer-ops` — **not installed, could not invoke.** Procedure below applied from expertise.*

**What freelancer ops requires.** (1) **Deadline tracking** for the recurring filings — periodic VAT
(15th), income-tax advances (same period), and the annual return (1301/1214 dates above). (2) **Osek-
patur revenue-ceiling monitoring** — a live running total of the calendar-year **turnover** against the
**122,833 ₪** ceiling, warning *before* it is crossed so the owner can voluntarily convert to Morshe
(crossing it makes the excess retroactively VAT-liable). (3) **Accountant handoff (חבילה)** — a clean
period/year export of invoices + receipts + a summary the רו״ח can ingest.

**Does FinFlow do these? Largely no.**
1. **No deadline tracking of any kind.** No calendar, no reminders, no notion of a filing period
   anywhere in the codebase. A freelancer gets zero prompting for the 15th-of-month VAT/advances or the
   June/July annual deadlines. **Significant gap.** *(Partly mitigated for VAT by the new
   VatReportView deadline strip — display only, no reminders.)*
2. **No osek-patur ceiling monitoring — and the data to do it exists.** The app knows
   `businessSettings.type === 'EsekPatur'` and has all invoices, yet **nothing compares year-to-date
   turnover to 122,833 ₪** and **no warning fires as the ceiling approaches or is crossed**
   (`TaxesView.tsx`, `InvoicesView.tsx`, `FinanceContext.tsx` — no threshold constant, no check). This
   is the highest-value, lowest-effort fix: a running `sum(invoice.total for current year)` vs a dated
   ceiling constant in `taxConfig.ts`, with an amber warning at e.g. 80–90% and a red one at/over 100%.
   Note: the ceiling is on **turnover (issued invoices), not paid revenue**, so it must *not* reuse the
   paid-only filter used elsewhere. **Critical for EsekPatur.**
3. **Accountant handoff is thin.** Expenses export to **CSV** (`ExpensesView.tsx:219-243`) but the CSV
   omits any VAT column (none is stored) and the receipt is only a status word, not a link. Invoices
   have **no bulk/period export at all** — only per-invoice PDF download (`InvoicesView.tsx:106-132`).
   There is no single "year package" (invoices + receipts + summary) for the רו״ח. Receipts do live in
   Drive, which helps, but there is no curated handoff bundle. *(Partly mitigated for VAT by the new
   VatReportView CSV, which now includes a VAT column and per-period invoice+expense sections.)*

**Top freelancer-ops gaps:** (a) **no osek-patur ceiling warning** despite having all the data (top
priority); (b) **no deadline/reminder system** for VAT, advances, and annual return; (c) **no
period/year accountant-handoff export** (invoices have none; expense CSV lacks VAT).

---

### Operational-readiness summary matrix

| Workflow | EsekPatur | EsekMorshe | Company | Verdict |
|---|---|---|---|---|
| Periodic VAT report (Doch Maam) | N/A (files annual מחזור only — also unsupported) | ⚠️ now implemented (see verification §) | ⚠️ now implemented (see verification §) | **Implemented; verify allocation/threshold** |
| Annual return 1301/1214 | ⚠️ income est. only, paid-basis, no mikdamot | ⚠️ same + no export | ❌ wrong (individual brackets, not 23%) | **Partial** |
| Freelancer ops (deadlines/ceiling/handoff) | ❌ no ceiling warning, no deadlines | ❌ no deadlines, thin export | ❌ no deadlines, thin export | **Not ready** |

### New open questions for the tax advisor (this section)
6. **Corporate tax rate for the Company path** — confirm 23% (2026) and whether the app should estimate
   it at all or defer entirely to the רו״ח.
7. **VAT basis** — confirm whether FinFlow's target users report VAT on accrual (invoice date) vs the
   cash basis available to some service providers, before building period grouping.
8. **Osek-patur ceiling mechanics** — confirm the exact 2026 turnover ceiling (122,833 ₪ verified) and
   the precise definition of "turnover" for the warning (issued vs paid; calendar year).
9. **Mikdamot rate/percentage** — the advance % is set per-business by the ITA; confirm whether to
   capture it as a setting and merely track payments, vs attempt to compute advances.

### Sources (this section)
- Osek-patur ceiling 122,833 ₪ (2026): https://www.greeninvoice.co.il/magazine/%D7%AA%D7%A7%D7%A8%D7%AA-%D7%A2%D7%95%D7%A1%D7%A7-%D7%A4%D7%98%D7%95%D7%A8/ , https://www.kolzchut.org.il/he/%D7%A2%D7%95%D7%A1%D7%A7_%D7%A4%D7%98%D7%95%D7%A8
- VAT reporting frequency, deadline 15th/23rd: https://www.h-erp.co.il/%D7%9E%D7%95%D7%A2%D7%93%D7%99-%D7%93%D7%99%D7%95%D7%95%D7%97-%D7%9C%D7%A9%D7%A0%D7%AA-%D7%9E%D7%A1/ , https://www.ucan2.co.il/%D7%93%D7%99%D7%95%D7%95%D7%97-%D7%9E%D7%A7%D7%95%D7%95%D7%9F-%D7%9C%D7%9E%D7%A2%D7%9E/
- Annual return deadlines 1301 (online 2026-06-30) / 1214 (online 2026-07-31): https://www.gov.il/he/service/reporting-and-payment-2025-annual-tax-report-for-individuals , https://www.gov.il/he/service/reporting-and-payment-annual-tax-report-2025-companies
- Mikdamot mechanics: https://www.kolzchut.org.il/he/%D7%AA%D7%A9%D7%9C%D7%95%D7%9D_%D7%9E%D7%A7%D7%93%D7%9E%D7%95%D7%AA_%D7%A9%D7%9C_%D7%A2%D7%A1%D7%A7_%D7%A2%D7%A6%D7%9E%D7%90%D7%99_%D7%9C%D7%9E%D7%A1_%D7%94%D7%9B%D7%A0%D7%A1%D7%94

---

## VAT Implementation Verification (2026-06-17)

**Skills used (Skill tool, this run):** `anthropic-skills:israeli-vat-reporting` (primary — output/input
VAT, Doch Maam 7-field mapping, deduction rules, zero-rated/exempt, deadlines) and
`anthropic-skills:israeli-freelancer-ops` (reporting cadence, allocation-number thresholds, deadline
calendar). Both loaded successfully this run (unlike the prior operational-readiness section, which
predates their availability).

**Scope:** verification of the uncommitted VAT feature in the working tree (new `src/utils/vatReport.ts`,
`src/pages/VatReportView.tsx`; modified `FinanceContext.tsx`, `taxConfig.ts`, `ExpensesView.tsx`,
`InvoiceFormPage.tsx`, `googleDrive.ts`) against `VAT_OSEK_MURSHE_SPEC.md` and live-verified regulation.

**Verdict:** ✅ **Largely compliant and faithful to the spec for an Osek Murshe; Osek Patur is correctly
excluded.** The 7 Doch Maam fields, accrual recognition, refund netting, draft/cancelled exclusion,
deductibility factors, the valid-tax-invoice gate and the supplier allocation gate are all implemented
correctly. **One confirmed regulatory data error** (monthly-filing threshold) and a small set of
lower-severity deviations are detailed below. No new Critical *legal-blocker* in the VAT report itself;
the standing allocation-number Critical (Gap 1, output side, real-time ITA API) is unchanged.

### What is COMPLIANT

1. **7 Doch Maam fields bucketed correctly** (`vatReport.ts:202-264`). Standard sales → base into
   Field 1 (`taxableSalesBase`) and VAT into Field 4 (`outputVat`); zero-rated → Field 2
   (`zeroRatedSales`, VAT 0); exempt → Field 3 (`exemptSales`, VAT 0); deductible input → base into
   Field 5 (`taxableInputsBase`) and claimable into Field 6 (`inputVat`); net Field 7 =
   `outputVat - inputVat`. Net/VAT split is recomputed via `computeTotals` (shared math path) rather
   than trusting stored `total`, per spec §4.
2. **Output VAT on accrual** (`outputRecognitionDate`, `vatReport.ts:98-103`) — defaults to
   `inv.date`; cash basis is opt-in. Matches the skill (accrual is the general rule) and spec §2.
3. **Refunded nets negative** (`vatReport.ts:209-219`): a `Refunded` invoice contributes `-base`/`-vat`
   to its recognition period, mirroring how `updateInvoice` excludes Refunded from totals. Spec §7 met.
4. **Draft & Cancelled excluded** (`EXCLUDED_STATUSES`, `vatReport.ts:57,203`) from both the report and
   the earliest-date scan. Spec §7 met.
5. **Input-VAT deductibility factors** (`DEDUCTIBILITY_FACTOR`, `vatReport.ts:60-64`): full=1,
   two_thirds=2/3 (vehicles), none=0 (entertainment/private). The valid-tax-invoice gate (Gate 1) and
   supplier allocation gate (Gate 3, `net >= allocationThreshold && !supplierAllocationNumber`) are both
   enforced before any claim (`vatReport.ts:142-155`). Matches the skill's deduction rules and spec §4.
   The `ExpensesView` form auto-suggests two_thirds for vehicle/travel and none for entertainment
   (`ExpensesView.tsx:42-56`) — correct, and user-overridable.
6. **Osek Patur correctly excluded.** `VatReportView` returns an info card for `type === 'EsekPatur'`
   (`VatReportView.tsx:45,75-95`); `ExpensesView` hides all input-VAT fields for Patur
   (`ExpensesView.tsx:68`); `InvoiceFormPage` forces Patur `vatTreatment` to `'standard'` and tax rate
   to 0 (`InvoiceFormPage.tsx:245-246`). A Patur thus never charges, reclaims, or reports VAT.
7. **Zero-rated/Eilat keep input VAT recoverable.** Zero-rated sales land in Field 2 with no output VAT,
   and the input side is computed independently of sale treatment — input VAT on a zero-rated
   exporter's purchases is fully claimable (no block keyed on the sale being 0%). Spec §7 met.
8. **Migration defaults do not silently claim legacy input VAT.** `expenseInputVat` defaults
   `vatDeductibility` to `'none'` and treats `hasValidTaxInvoice` undefined as a blocking
   `no_tax_invoice` (`vatReport.ts:140-145`); the `ExpensesView` edit path also defaults legacy rows to
   `none`/`false` (`ExpensesView.tsx:169-171`). Legacy expenses therefore contribute **0** claimable
   input VAT until the user explicitly confirms. Spec §8 met. New `BusinessSettings` defaults
   (`vatReportingPeriod: 'bimonthly'`, `vatCashBasis: false`) are seeded in both `FinanceContext.tsx`
   and `googleDrive.ts` (`:46-47`).
9. **Output-side allocation flag** (`vatReport.ts:222-231`): non-refund standard/zero-rated tax
   invoices whose base ≥ dated threshold and lacking an `allocationNumber` are surfaced in
   `invoicesMissingAllocation`, linked for fixing in the warnings panel. This is the correct *reporting*
   surfacing of the standing Gap 1.
10. **Allocation threshold is date-correct.** `getAllocationThreshold` resolves **5,000 ₪ from
    2026-06-01** (`taxConfig.ts:49-53`) — matches live research. Both the expense input gate and the
    output flag resolve the threshold by the document's own date, not "today".

### Deviations / gaps found

**D1 — Monthly-filing turnover threshold is WRONG (regulatory data error). Severity: High.**
`taxConfig.ts:76-78` sets `VAT_MONTHLY_FILING_THRESHOLD_TABLE` to **1,775,000 ₪** (the spec §2 and the
prior report's operational section carry the same figure). Live verification today against Section
**67(a)(2) of the VAT Law / VAT Regulations** gives the statutory threshold as **NIS 1,500,000** (a CPA
source cites a lightly-indexed 1,502,000). At 1,775,000 the app *understates* who must file monthly:
a business turning over 1.5M–1.775M would never trigger the "switch to monthly" suggestion
(`VatReportView.tsx:72-73`, `getVatMonthlyFilingThreshold`) and could keep filing bi-monthly when the
law requires monthly. **Fix:** change the dated value to **1,500,000** (effective 2026-01-01),
advisor-confirm whether to use the rounded statutory 1,500,000 or the indexed 1,502,000. This is a
data fix only — the wiring is correct.
*Sources:* Section 67 VAT Law per yaniv-toledano CPA Q&A; tax-advisor.co.il (1,502,000);
amir-cpa; misim.gov.il registration pages (links below).

**D2 — `suggestMonthly` banner is informational only; no statutory-trigger when PCN874 applies.
Severity: Low (spec-conformant).** The banner uses trailing standard+zero-rated *base* vs the threshold
(`VatReportView.tsx:68-73`). Spec §5 explicitly allows this as a suggestion. But note: from 2026 a
**sole proprietor with turnover > 500,000 ₪ must file the detailed report (PCN874) AND switch to
monthly** regardless of the 1.5M figure — the app has no 500,000 ₪ detection, so it won't prompt that
mandatory switch. The deadline strip already shows the 23rd "detailed" date only when cadence is
already monthly (`VatReportView.tsx:208`), which is circular: a >500k bi-monthly filer sees neither the
monthly obligation nor the 23rd deadline. **Recommend** adding a dated 500,000 ₪ PCN874 threshold and a
distinct banner. Advisor-confirm (Open Q below).

**D3 — Deadlines are nominal only; do not shift for Shabbat/חג. Severity: Low (spec-conformant, but
verify).** `periodDeadlines` (`vatReport.ts:348-370`) returns fixed 15th/19th/23rd. The skill and spec
§5 both accept nominal dates with a "verify if it lands on Shabbat/holiday" note, which the UI shows
(`vat.deadline_shabbat_note`). The 15th/19th/23rd values themselves match current rules
(manual 15th, online SHAAM 19th, detailed-filer 23rd). Acceptable for v1.

**D4 — CSV export re-derives the net/VAT split with a *parallel* code path. Severity: Low (bug-risk).**
`exportCsv` recomputes invoice subtotal/VAT inline (`VatReportView.tsx:138-139`) and expense net/VAT
inline (`:178-180`) instead of reusing `computeTotals`/`expenseInputVat`. It also period-buckets
invoices/expenses with hand-rolled `Math.ceil((month)/2)` logic (`:130-136,169-176`) duplicating
`periodFor`. The numbers happen to agree today, but this is a second source of truth that can drift
(e.g. if the derivation rule changes). **Recommend** exporting from the already-computed `VatReport`
and reusing `periodFor`. Not a compliance error.

**D5 — `excludedInputVat` diagnostic skips blocked rows that carry no computable VAT. Severity: Low,
arguably correct.** When a legacy expense has no VAT info and isn't confirmed, `expenseInputVat` returns
`vat: 0` and the warnings panel skips it (`vatReport.ts:247`). So a user with many un-reviewed legacy
expenses sees no nudge that input VAT may be unclaimed. The spec's §8 "review your expenses for VAT"
one-time nudge is not implemented. **Recommend** a separate count of un-reviewed expenses. Minor.

**D6 — Trailing-base window for the monthly suggestion is approximate. Severity: Low.**
`trailingBase` sums the last 6 (bi-monthly) reports = ~12 months (`VatReportView.tsx:68-71`), but
`reports` is sorted desc and *includes the current, possibly-partial period*, so the window is a rough
trailing-12m rather than a strict one. Combined with D1's wrong threshold the banner is doubly
unreliable today. Fix D1 first.

### Confirmed NOT a problem (checked explicitly)
- **Exempt input-VAT apportionment** is intentionally out of v1 scope (spec §7 / Open Q4) — exempt
  sales are reported in Field 3 but input VAT is not auto-disallowed proportionally. Documented, not a
  regression.
- **Period enumeration** in `buildAllVatReports` (`vatReport.ts:312-323`) correctly walks every period
  start→now inclusive (including zero-activity periods), satisfying the "must file even with no
  activity" rule (spec §5). Ordinal arithmetic (`year*perYear+index`) is consistent for both endpoints.
- **Cash-basis recognition** falls back to `inv.date` when `sentAt` is absent (`vatReport.ts:99-101`),
  matching spec §4's documented approximation; flagged for advisor confirmation, not a defect.

### Top gaps (priority order)
1. **D1 — monthly-filing threshold 1,775,000 → 1,500,000 in `taxConfig.ts`.** Regulatory data error;
   one-line fix; affects who is told to file monthly. **Do this before relying on the banner.**
2. **Standing Gap 1 (allocation number, output side) — unchanged Critical.** The VAT report correctly
   *flags* missing allocation numbers, but issuance still neither obtains nor prints one. Not introduced
   by this feature; tracked above.
3. **D2 — no 500,000 ₪ PCN874 detection** → a >500k sole proprietor isn't told to move to monthly /
   the 23rd deadline. Add a dated threshold + banner (advisor-confirm).
4. **D4 — unify CSV export with the calc module** to remove the parallel math path (cleanup, not
   compliance).

### Open questions for the tax advisor (VAT verification)
- Confirm the monthly-filing threshold figure to hardcode: statutory **1,500,000** vs indexed
  **1,502,000** (and its exact effective date).
- Confirm the **500,000 ₪** PCN874 / detailed-report threshold forces monthly filing for *sole
  proprietors* from 2026-01-01 and whether FinFlow should detect and surface it.
- Confirm whether this Osek is on **cash basis** (changes `outputRecognitionDate`).
- Confirm **Eilat** zero-rated treatment and any input-VAT nuance.
- Confirm whether **refunds** must be a separate credit-note document (own gapless series) vs the
  current `Refunded` status flip.

### Sources (VAT verification, confirmed 2026-06-17)
- Monthly vs bi-monthly threshold NIS 1,500,000 (Section 67(a)(2) VAT Law): https://www.xn--7dbdbjvz.co.il/%D7%9E%D7%90%D7%9E%D7%A8%D7%99%D7%9D/%D7%A2%D7%95%D7%A1%D7%A7-%D7%9E%D7%95%D7%A8%D7%A9%D7%94-%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%95%D7%AA%D7%A9%D7%95%D7%91%D7%95%D7%AA/ , https://www.tax-advisor.co.il/%D7%A2%D7%95%D7%A1%D7%A7-%D7%9E%D7%95%D7%A8%D7%A9%D7%94/
- Allocation number 5,000 ₪ from 2026-06-01: https://www.vatupdate.com/2026/04/12/israel-to-lower-invoice-allocation-number-thresholds-further-in-2026-for-real-time-tax-compliance/ , https://herzoglaw.co.il/en/news-and-insights/overview-of-vat-and-customs-updates-effective-in-2026/
- PCN874 detailed report > 500,000 ₪ from 2026-01-01, deadline 23rd: https://www.amir-cpa.net/post/%D7%93%D7%99%D7%95%D7%95%D7%97-%D7%9E%D7%A4%D7%95%D7%A8%D7%98-%D7%9C%D7%9E%D7%A2-%D7%9E-%D7%9C%D7%A2%D7%A6%D7%9E%D7%90%D7%99-%D7%9E-2026-%D7%97%D7%95%D7%91%D7%95%D7%AA-%D7%95%D7%94%D7%A7%D7%9C%D7%95%D7%AA
- VAT filing deadlines 15th manual / 19th online: skill `anthropic-skills:israeli-vat-reporting`; https://www.misim.gov.il/emrishum/wHoraotRishum.aspx

---

## Cash-Law Feature Verification (2026-06-17)

**Skills used (Skill tool, this run):** `anthropic-skills:israeli-freelancer-ops` (Cash Law / חוק
לצמצום השימוש במזומן cap & enforcement) and `anthropic-skills:israeli-vat-reporting` (which document
types record receipt of payment — קבלה / חשבונית מס-קבלה — vs demand documents). Both loaded
successfully.

**Scope:** verification of the UNCOMMITTED Cash-Law + multi-payment feature in the working tree on
`main` (`src/config/taxConfig.ts`, `src/utils/invoiceMath.ts`, `src/context/FinanceContext.tsx`,
`src/pages/InvoiceFormPage.tsx`, `src/services/pdf/InvoiceTemplate.tsx`, plus the new i18n keys in
`src/i18n/locales/{en,he}.json`) against `CASH_LAW_PAYMENTS_SPEC.md` and live-verified regulation.

**Verdict:** ✅ **Compliant and faithful to the spec across all four document types.** The cash cap is
the correct legal figure and correctly date-keyed; it is computed on the cash portion only (not the
whole deal); it is enforced on exactly the two payment-recording document types and skipped on the two
demand documents; validation blocks both unbalanced lines and over-cap cash; Draft bypass works; the
migration is faithful and non-retroactive; and the PDF discloses the breakdown only on receipts. **No
deviation from regulation or spec rises to Critical. Nothing here should block a commit.** A small set
of low-severity polish items is listed below; none are compliance failures.

### Item-by-item verification (the five checks requested)

**1. Cash cap = min(₪6,000, 10% of total), date-keyed, current figure — ✅ confirmed.**
- Live research today confirms the business-transaction (עוסק) cap is the **lower of ₪6,000 or 10% of
  the transaction value**, in force since **1 August 2022** (down from ₪11,000). The sources give the
  worked example "a ₪100,000 purchase → at most ₪6,000 in cash," matching the spec.
- `CASH_LIMIT_TABLE` (`taxConfig.ts:99-101`) holds `{ effectiveFrom: '2022-08-01', value: { flatCap:
  6000, dealFraction: 0.1 } }` and `getCashLimit(date)` (`:165-167`) resolves it date-keyed via the
  same `resolveDated` helper as VAT/allocation. Effective date is correct.
- `cashCapForTotal(total, limit)` (`invoiceMath.ts:101-103`) returns `Math.min(limit.flatCap,
  limit.dealFraction * total)` — exactly the law's "lower of." The 10% binds below ₪60,000, the flat
  ₪6,000 at/above. Confirmed: a ₪3,000 receipt caps cash at ₪300; a ₪100,000 receipt caps at ₪6,000.

**2. Cap on cash portion only; large total splittable; enforced on the right document types — ✅
confirmed.**
- The cap is applied to `sumCashPayments(lines)` only (`invoiceMath.ts:91-93`, used in
  `validatePayments:142-143`), never to the total — so a large total is settled by splitting cash +
  non-cash, with only the cash lines tested against the cap. This is the legally correct framing.
- `recordsPayment(documentType)` (`invoiceMath.ts:81-83`) returns true for **`Receipt` and
  `TaxInvoiceReceipt`** only — matching the regulation (these record actual receipt of money) and the
  spec table. `TaxInvoice` (demand) and `TransactionInvoice` (pro-forma) return false.
- Enforcement is gated on `recordsPayment(...)` in all three layers: the form only renders the Payments
  editor when `showsPayments` (`InvoiceFormPage.tsx:175`), and `addInvoice`/`updateInvoice` only
  validate when `recordsPayment(...)` (`FinanceContext.tsx:516,563`). On submit, payment fields are
  written only for payment docs and set `undefined` for the others (`InvoiceFormPage.tsx:304-305`), so
  a `TaxInvoice`/`TransactionInvoice` never carries payment lines. Switching the document type to a
  non-payment type makes the derived `displayLines` become `[]`, so stale lines are not persisted.
  Correct.

**3. Validation: sum-to-total, cash-over-cap block, Draft bypass — ✅ confirmed.**
- `validatePayments` (`invoiceMath.ts:134-153`): `balanced` = `|total − sumPayments| ≤ 0.01`;
  `cashOverCap` = `cashTotal > cashCap + 0.01`; `ok` = `balanced && !cashOverCap && every line > 0`,
  with `PAYMENT_EPS = 0.01` tolerance throughout (handles VAT-driven non-integer totals). Matches
  spec §5 field-for-field.
- The over-cap message (`invoices.cash_over_limit`) is present in **both** locales with correct
  `{{cap}}` / `{{excess}}` interpolation, states the excess is blocked under the Cash Law without
  quoting a percentage (per spec §2/§10 — the עיצום כספי figure is deliberately not printed). The
  unbalanced message (`invoices.payment_unbalanced`) is likewise present in both locales. The form
  renders the cash-over-cap block in red, marks the offending cash row, and shows the live `max_cash`
  cap.
- **Block is real, not advisory.** Save is disabled via `paymentsBlockSave` (`InvoiceFormPage.tsx:200,
  746`), re-checked in `handleSubmit` (`:269-271`), and re-validated as a final guard in both
  `addInvoice` (`FinanceContext.tsx:516-522`) and `updateInvoice` (`:563-570`) — three-layer
  defense-in-depth mirroring the allocation-number pattern.
- **Draft bypass is correct.** All three layers gate on `status !== 'Draft'`, so a Draft may be saved
  partial/unbalanced/over-cap (it is not yet a legal document). The unbalanced UI block is also only
  shown for non-Draft (`:521`). Matches spec §9 (enforce only on non-Draft).

**4. Migration faithfulness — ✅ faithful, and the legacy-cash concern is correctly handled.**
- `paymentLinesOf` (`invoiceMath.ts:160-166`) is lazy/read-only: it prefers stored `paymentLines`,
  else maps a legacy single `paymentMethod` to **one full-total line**, else `[]`. No bulk rewrite of
  the invoices array — respects the issued-document retention rule and avoids a mass Drive write.
- **The specific concern raised — a fully-cash legacy receipt over the current cap — does NOT get
  misrepresented as newly non-compliant.** The legacy mapping only *displays* the historical payment;
  the cap is never evaluated at read/PDF time. `validatePayments` runs only on a *new save/edit* of a
  payment-recording, non-Draft document (`FinanceContext.tsx:516,563`). A legacy all-cash receipt that
  was lawful when issued is therefore neither retroactively blocked nor relabelled — it simply renders
  its one cash line. This matches spec §8 (issued documents immutable/retained; only new touches are
  validated) and is the correct outcome. **No misrepresentation.** (Caveat: re-opening such a legacy
  doc in the form and saving it as non-Draft would now validate it — but that is an intentional *edit*,
  not passive display, and is the documented behavior.)
- Minor-but-faithful nuance: the legacy line uses a fixed `id: 'legacy'`. The editor remaps it to a
  fresh id (`InvoiceFormPage.tsx:54`), so React-key collisions across multiple legacy docs can't occur
  in the form; in the PDF only one legacy line renders per document, so the static key is safe there
  too. No defect.

**5. PDF discloses the breakdown only for קבלה / חשבונית מס-קבלה — ✅ confirmed.**
- `InvoiceTemplate.tsx:38` computes `paymentLines = recordsPayment(invoice.documentType) ?
  paymentLinesOf(invoice) : []`, so a `TaxInvoice`/`TransactionInvoice` shows no payment block even if
  a stray `paymentMethod` were present. For receipts, each tendered method renders as
  `{label} — {amount}` (one row per line) inside the `<Ltr>` wrapper for correct RTL capture
  (`:87-97`). A single-line receipt reads like the old single-method display. The legacy
  `paymentMethod` back-compat branch (`:101-105`) is preserved for any non-migrated reader.

### Low-severity polish (NOT compliance failures, NOT commit blockers)

- **P1 — `paymentMethod` mirror is lossy on a split.** On save the legacy `paymentMethod` is mirrored
  from `resolvedPaymentLines[0]?.method` (`InvoiceFormPage.tsx:305`) — for a multi-line split it
  records only the *first* method into the deprecated field. Harmless today because every live reader
  (PDF, form) uses `paymentLinesOf` and prefers `paymentLines`; spec §3/§8 explicitly allow the mirror
  as optional. Consider dropping it or documenting it as first-method-only.
- **P2 — single-line auto-sync to total.** When ≤1 line exists, `displayLines` derives one line at
  `amount: total` (`InvoiceFormPage.tsx:183-187`). If the user picks Cash on that single line for a
  total above the cap, the synced amount correctly trips `cashOverCap` and blocks — the intended spec
  §6 behavior. No issue; noted only because the auto-sync rewrites the single-line amount.
- **P3 — `allPositive` requires ≥1 line.** `validatePayments` sets `ok=false` when `lines.length === 0`
  (`invoiceMath.ts:144`). A non-Draft receipt with a ₪0 total seeds a single line of `amount: 0`,
  dropped by the `>0` filter, leaving no lines → save blocked. A ₪0 receipt is itself nonsensical, so
  this is acceptable; worth an advisor note only if fully-discounted ₪0 receipts ever occur.

### Top gaps (priority order)
1. None at Critical or High. The feature is commit-ready from a compliance standpoint.
2. **P1 (lossy `paymentMethod` mirror)** — cosmetic/data-hygiene; optional.
3. The standing **allocation-number Critical (Gap 1)** is unrelated to this feature and unchanged.

### Open questions for the tax advisor (Cash-Law — carried from spec §10)
- **Block vs. warn** for cash-over-cap: this implementation hard-blocks on non-Draft. Confirm the
  business accepts that FinFlow will refuse to *record* an over-cap cash receipt.
- **Tourist exception** (higher ceiling for a tourist paying a business) — no "customer is a tourist"
  flag exists; out of scope for v1.
- **Cheques** are restricted separately from "cash" under the law; FinFlow has no `Cheque` method.
- **"Transaction value" across multiple receipts/instalments** — the cap is on the whole transaction,
  not each receipt; the app treats each receipt `total` as the transaction price. Confirm no split-deal
  scenarios need aggregate tracking.

### Sources (Cash-Law verification, confirmed 2026-06-17)
- Cash cap ₪6,000 OR 10% (lower), business transaction, since 1 Aug 2022, ₪100,000→₪6,000 example:
  iCount — https://www.icount.co.il/blog/%D7%94%D7%A9%D7%A4%D7%A2%D7%AA-%D7%97%D7%95%D7%A7-%D7%94%D7%9E%D7%96%D7%95%D7%9E%D7%9F-%D7%A2%D7%9C-%D7%A2%D7%A1%D7%A7%D7%99%D7%9D/ ; Invoice4u — https://www.invoice4u.co.il/blog/%D7%97%D7%95%D7%A7-%D7%94%D7%9E%D7%96%D7%95%D7%9E%D7%9F/ ; Wikipedia (he) — https://he.wikipedia.org/wiki/%D7%97%D7%95%D7%A7_%D7%9C%D7%A6%D7%9E%D7%A6%D7%95%D7%9D_%D7%94%D7%A9%D7%99%D7%9E%D7%95%D7%A9_%D7%91%D7%9E%D7%96%D7%95%D7%9E%D7%9F
- Skill procedures: `anthropic-skills:israeli-freelancer-ops`, `anthropic-skills:israeli-vat-reporting`
