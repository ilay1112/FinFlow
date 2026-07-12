# FF-PM-1 — Competitor scan (Israeli invoicing/finance rivals)

**Status:** Deep scan complete — owner named the two main rivals (2026-07-12, resolving the prior
QUESTION on TEAM_BOARD.md): **Sumit** (sumit.co.il) and **EZcount** (ezcount.co.il, by Hyp).

**Owner:** product-manager · **Ticket:** FF-PM-1 · **Date:** 2026-07-12

**Correction to the first-pass framing (2026-07-12, owner instruction):** the earlier version of this
scan led with FinFlow's zero-server / "data in your own Google Drive" model as the headline
differentiator. **That is not FinFlow's main selling point and is dropped from the comparison below.**
This scan compares on what the buyer actually evaluates: invoicing/receipts, expense tracking,
VAT/tax reporting, ITA allocation-number handling, pricing, ease of use, Hebrew-first UX, and mobile.

## Method
WebSearch + WebFetch against each vendor's own pricing/FAQ/help-center pages and app-store listings
(2026-07-12). No login/trial was created (validation-stage scan only, $0 cost). Sumit's pricing page
renders its tier table via client-side JS that WebFetch's markdown conversion could not fully extract
past the first two tiers — flagged as an `assumption:` below rather than guessed.

## Confirmed identities
1. **Sumit** — [sumit.co.il](https://www.sumit.co.il/) · [pricing](https://www.sumit.co.il/pricing) ·
   [help center](https://help.sumit.co.il/) · developer of record "SUMIT ALWAYS ON IT LTD." Owner's
   "summit" spelling refers to this product — confirmed via search volume, `.co.il` domain, and
   product identity (no separate "Summit" Israeli invoicing product exists).
2. **EZcount (EasyCount)**, by Hyp — [ezcount.co.il](https://www.ezcount.co.il/) ·
   [FAQ](https://www.ezcount.co.il/faq) · pricing published at
   [hyp.co.il/digital-invoice-pricing](https://hyp.co.il/digital-invoice-pricing/) (Hyp is the parent
   payments company; EZcount is the invoicing product/wedge).

## Head-to-head

| Dimension | Sumit | EZcount | FinFlow today |
|---|---|---|---|
| Pricing model | **Pay-per-action** (documents + card charges + time entries + more), not flat doc-count tiers | Flat monthly tiers gated by doc count | $0 (no tiers yet; pricing hypothesis in `FF-PM-3`) |
| Entry price | Free: 10 actions/mo. Starter: **₪25+VAT/mo**, 50 actions/mo | Givol: **₪24/mo** (₪21/mo annual), 50 docs/mo | $0 |
| Top published tier | Not fully extractable (JS calculator) — `assumption:` scales actions/modules up, per-action cost down | Pardes: **₪79/mo**, unlimited docs, 10 users, full payment stack | — |
| Esek type gating | None explicit — action volume is the axis, same as EZcount/Morning/iCount | None explicit — same pattern | None (matches market norm) |
| Invoicing/receipts (Patur receipt vs Morshe tax invoice, sequential numbering, credit notes, foreign-currency docs) | Full set — "כל סוגי המסמכים" (tax invoice, tax invoice/receipt, receipt, quote, delivery note, purchase order, credit note) | Full set — FAQ explicitly walks through Esek Patur transaction-invoice-then-receipt sequencing; strict separate numbering series enforced | Full set claimed in `ARCHITECTURE.md` §6.1 (Esek Patur/Morshe split ID sequences) — architecturally comparable scope, not independently load-tested at rival's document volume |
| Expense tracking | Included **from the free tier** — plus AI-scan-a-receipt mobile capture (per review) | Included, but **gated to the Shtil tier (₪36/mo) and up** — not on the ₪24 entry tier | Included, ungated (no pricing yet) |
| VAT/tax reporting | Not surfaced as a named marketing feature on public pages (may exist behind login) — `assumption:` unconfirmed | Not surfaced as a named marketing feature on public pages — `assumption:` unconfirmed | Dedicated feature: `VatReportView.tsx` + `vatReport.ts` (real, built) — plausible edge, but unverified against rivals' actual in-app VAT report (behind auth, not scanned) |
| **ITA allocation-number automation** | **Automated.** Direct Tax-Authority connection, "approved system," available **from the Starter (paid) plan up**, not the free tier | **Automated.** Direct Tax-Authority connection, auto-requests on any invoice ≥₪5,000 (tracks the June-2026 threshold drop from ₪20,000→₪5,000), entered directly into the PDF | **Manual (interim)** — `ops/PRODUCT.md` Known landmines: "real-time ITA integration is unbuilt and needs a backend (conflicts with the zero-server model)" |
| Mobile apps | **Confirmed native** iOS (App Store, iOS 15+) and Android (Google Play), developer SUMIT ALWAYS ON IT LTD | **Ambiguous.** FAQ claims "yes we have an app," but no confirmed native App Store/Play Store listing found under EZcount's name — likely a responsive mobile web experience rather than an installed native app | Capacitor Android wrapper exists in `android/` but **not shipped**; iOS dep added but "not yet a full target" (`PRODUCT.md` Platforms table). Web-first launch order. |
| Payment collection (cards, Bit, Apple/Google Pay, standing orders) | **Standout strength** — a third-party review called its collection/standing-order module "without competition"; native card processing | Native via parent Hyp — Bit/Apple Pay/Google Pay wallet buttons, card processing, in the top tier (Pardes) | **Explicitly out of scope** — `PRODUCT.md` Non-negotiables: "FinFlow does not process payments" (deliberate) |
| Ease of use / positioning | Feature-rich, broader "business management" suite (payments, standing orders, tasks, time tracking) — 3rd-party review flags "a short adjustment period" for users used to simpler tools | Markets itself explicitly as fast/simple ("חשבוניות באינטרנט במהירות ובקלות" — invoicing online, fast and easy) | Narrow, single-purpose scope (invoices, expenses, clients, agent commissions, taxes) — no CRM/inventory/time-tracking/payments bloat |
| Onboarding | Multi-step Tax-Authority digital-services authorization required for allocation numbers (same requirement as EZcount) | Low-friction free signup CTA; same Tax-Authority authorization step required for allocation numbers | No ITA connection step exists yet (nothing to authorize) |
| Hebrew-first / bilingual UX | Hebrew-native UI; "multi-language document generation" refers to exporting documents in other languages, not a bilingual app UI (unconfirmed EN UI) | Hebrew-native UI; no bilingual app UI claim found | Hebrew-native UI **with a genuine EN toggle** (`src/i18n/locales/{en,he}.json`) — untested claim of edge for non-Hebrew-native freelancers (olim/expats), needs interview validation |
| Scale/trust signal | Not independently found (no public user count located) | ~24,000 businesses claimed (FAQ), serves Patur/Morshe/Ltd/nonprofits, named verticals (lawyers, architects, kindergartens, artists, therapists) | Zero external validation (pre-Validate-stage exit) |

## Where FinFlow can plausibly win (realistic, not privacy-framed)

- **Price, plainly.** $0 vs. Sumit's ₪25+VAT and EZcount's ₪24/mo entry tiers. This is a real, simple
  number a freelancer compares — not a privacy argument, just "free vs. not free." Caveat: this is a
  *temporary* structural advantage (`ops/PRODUCT.md`: "free now, monetize later," `FF-PM-3` pricing
  hypothesis already in flight) — it disappears the moment FinFlow starts charging, so it should not
  be treated as a durable moat in positioning copy.
- **Scope simplicity.** Both rivals are drifting toward full "business management" suites (Sumit:
  standing orders, time tracking, tasks, card processing; EZcount: card processing, wallet buttons,
  inventory). FinFlow's narrower single-purpose scope (invoicing/expenses/clients/agents/taxes, no
  payments) is a plausible positioning wedge for a freelancer who specifically does **not** want a
  payments/CRM/ERP bundle. `assumption:` unproven — needs `FF-PM-2` interviews to confirm this reads
  as "focused" rather than "missing features I actually want."
- **Ungated expense tracking.** EZcount gates expense management behind its second tier (₪36/mo);
  Sumit includes it free but inside its metered-action model where volume triggers charges. FinFlow's
  expense tracking has no pricing gate today — worth preserving as a stated value if/when FF-PM-3's
  tiers are finalized (don't gate the feature both rivals treat as a paid-tier lever).
- **Bilingual product UI**, not just bilingual documents. Neither rival's public pages surfaced an
  English application UI (only Hebrew UI, with EZcount offering multi-language *document output*).
  FinFlow's actual EN/HE app toggle is a plausible edge for olim/expat freelancers. `assumption:` —
  add a WTP/pain question to the `FF-PM-2` interview guide to confirm this matters to real users
  rather than being a nice-to-have nobody asked for.

## Where FinFlow must catch up (realistic gaps, confirmed against both named rivals)

- **ITA allocation-number automation — the single biggest, now double-confirmed gap.** Both Sumit and
  EZcount (and Morning, from the first-pass scan) automate allocation-number requests against the Tax
  Authority; EZcount explicitly tracks the ₪5,000 threshold that took effect June 2026. FinFlow
  captures this **manually** today (`ops/PRODUCT.md` Known landmines), and the zero-server model makes
  automating it structurally harder (needs a backend to call the ITA API, or an as-yet-undesigned
  client-side pattern). With the threshold now at ₪5,000, a meaningful share of Esek Morshe invoices
  will trip the requirement — this is a compliance exposure, not just a feature gap, and should be the
  top engineering-design conversation once the product exits Validate stage.
- **Native mobile.** Sumit ships confirmed native iOS + Android apps with in-app receipt-scanning
  (per review). EZcount's native-app status is ambiguous but at minimum offers a polished mobile-web
  experience. FinFlow has shipped **neither** — the Capacitor Android wrapper exists but is unpublished,
  and iOS isn't yet a full target (`PRODUCT.md` Platforms table, launch order: Web → Android → iOS).
  If problem interviews (`FF-PM-2`) surface "I need to log expenses/receipts on the go" as a real pain,
  this becomes the second most urgent catch-up item.
- **No payment collection — a deliberate scope choice, but a real feature gap versus both rivals.**
  Sumit's standing-order/collection module and EZcount's Hyp-powered card/Bit/Apple Pay/Google Pay
  buttons are both native, in-invoice payment collection. FinFlow explicitly does not process payments
  (`PRODUCT.md` Non-negotiables). This should stay a deliberate non-goal, not get chased — but it must
  be a clear, upfront line in positioning ("we don't collect payments — pair with X"), because a
  freelancer expecting "get paid in the same tool that bills" will otherwise churn to a rival that
  does this natively.
- **VAT/tax reporting — unverified, not necessarily a gap.** FinFlow has a dedicated, built VAT-report
  feature (`VatReportView.tsx`, `vatReport.ts`). Neither rival surfaces VAT reporting as a named public
  marketing feature, but both almost certainly have *some* in-app VAT/tax summary behind login — this
  scan could not confirm either way without an account. `assumption:` flagged; not claimed as an edge
  until verified (would need a rival trial account, which is out of scope for a $0 validation-stage
  scan — defer to `FF-PM-2` interviews asking users what they use today for VAT reporting).

## Other observed rivals (from the first-pass scan, not owner-named — kept for context only)
- **Morning (formerly Green Invoice)** — fully cloud, ~160k businesses, acquired by TeamSystem for
  ~$150M (Dec 2024), automated allocation numbers, ₪29–155/mo. Largest scale/trust signal of any
  product surveyed across both passes.
- **iCount** — cloud, pay-per-document in USD, CRM/inventory/time-tracking add-ons, 45-day trial.
  Not deep-scanned this pass; owner named Sumit + EZcount specifically.

These remain useful market context (both charge more than Sumit/EZcount's entry tiers, or use a
different pricing currency/model) but are not part of this scan's head-to-head per owner direction.

## `assumption:` flags carried forward
- `assumption:` Sumit's tier structure beyond Free (₪0, 10 actions) and Starter (₪25+VAT, 50 actions)
  — the pricing page renders further tiers via a client-side calculator that this scan's fetch tooling
  could not fully extract. Directionally confirmed ("more expensive plans = more modules, cheaper
  per-action cost") via Sumit's own help-center pricing explainer, but exact ₪ figures for a 3rd/4th
  tier are not captured here.
- `assumption:` EZcount's native mobile-app status — FAQ claims an app exists, but no confirmed
  App Store/Play Store listing was found under EZcount's name. Needs a direct check on-device before
  this is asserted either way in future collateral.
- `assumption:` neither rival's in-app VAT/tax-report feature was verified (both are behind auth) —
  flagged above, not claimed as a FinFlow edge until checked.

## Sources
- [sumit.co.il](https://www.sumit.co.il/) · [pricing](https://www.sumit.co.il/pricing) ·
  [pricing-model explainer](https://help.sumit.co.il/he/articles/5507895-%D7%90%D7%99%D7%9A-%D7%A2%D7%95%D7%91%D7%93-%D7%94%D7%9E%D7%97%D7%99%D7%A8%D7%95%D7%9F) ·
  [allocation-number automation article](https://help.sumit.co.il/he/articles/8267195-%D7%94%D7%A7%D7%A6%D7%90%D7%AA-%D7%9E%D7%A1%D7%A4%D7%A8%D7%99-%D7%97%D7%A9%D7%91%D7%95%D7%A0%D7%99%D7%95%D7%AA-%D7%90%D7%95%D7%98%D7%95%D7%9E%D7%98%D7%99%D7%AA-%D7%9C%D7%A6%D7%95%D7%A8%D7%9A-%D7%93%D7%99%D7%95%D7%95%D7%97-%D7%9E%D7%A2-%D7%9E-%D7%A2%D7%9C-%D7%AA%D7%A9%D7%95%D7%9E%D7%95%D7%AA-%D7%97%D7%A9%D7%91%D7%95%D7%A0%D7%99%D7%95%D7%AA-%D7%99%D7%A9%D7%A8%D7%90%D7%9C) ·
  [App Store listing](https://apps.apple.com/il/app/%D7%A1%D7%90%D7%9E%D7%99%D7%98-sumit/id1596271370) ·
  [Google Play listing](https://play.google.com/store/apps/details?id=com.app.sumit) ·
  [3rd-party review, softwarecompare.co.il](https://softwarecompare.co.il/blog/%D7%91%D7%99%D7%A7%D7%95%D7%A8%D7%AA-%D7%A1%D7%90%D7%9E%D7%99%D7%98/)
- [ezcount.co.il](https://www.ezcount.co.il/) · [FAQ](https://www.ezcount.co.il/faq) ·
  [hyp.co.il/digital-invoice-pricing](https://hyp.co.il/digital-invoice-pricing/) ·
  [allocation-number support article](https://support.ezcount.co.il/hc/he/articles/17339339791762-%D7%90%D7%99%D7%9A-%D7%9E%D7%A4%D7%99%D7%A7%D7%99%D7%9D-%D7%9E%D7%A1%D7%9E%D7%9B%D7%99%D7%9D-%D7%A2%D7%9D-%D7%9E%D7%A1%D7%A4%D7%A8-%D7%94%D7%A7%D7%A6%D7%90%D7%94)
- (First-pass context, kept from the earlier scan) [greeninvoice.co.il](https://www.greeninvoice.co.il/) ·
  [icount.net](https://www.icount.net/) · [Calcalist — Morning/TeamSystem acquisition](https://www.calcalistech.com/ctechnews/article/sjasx0qikl)
