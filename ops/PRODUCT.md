# PRODUCT.md — product context (the one per-product file)

Agents read this instead of baking product facts into their definitions. Edit only at cache-epoch
boundaries; announce edits as a `DECISION` on the board.

## Identity
- **Name:** FinFlow
- **One-liner (what it does, for whom):** Israeli freelancer finance suite — Israeli-compliant
  invoicing (Esek Patur / Esek Morshe), expenses, clients, booking-agent commissions, and tax
  tracking for freelancers & small businesses. Zero-server privacy model: all data lives in the
  user's own Google Drive.
- **Business model / pricing tiers:** Free now, monetize later. `assumption:` future paid tier(s)
  undefined — revenue model to be decided after validation.
- **Revenue goal (monthly, 12-month target):** None — goal this year is to **validate the idea**
  (no MRR target). Prioritize retention/usage-depth learning over monetization.
- **Lifecycle stage (LIFECYCLE.md):** **1. Validate** (lead: product-manager). The product is
  live and feature-rich but demand rests on owner conviction, not user evidence — so the Now list is
  validation work (problem interviews, landing/waitlist, competitor scan, pricing hypothesis), not
  more features. Exit evidence: 20+ waitlist signups, 10+ problem interviews, or pre-orders.

## Growth & distribution
- **Primary channels (first 100 users):** search/content (SEO — Israeli tax/invoicing queries) ·
  communities & social (freelancer groups) · owner's existing audience/referrals. → seeds SEO +
  marketing lane priorities.
- **Alternatives users have today:** **Sumit** (sumit.co.il) and **EZcount** — Israeli invoicing
  SaaS for small businesses (owner-named 2026-07-12; deep scan in FF-PM-1).
- **Positioning (owner, corrected 2026-07-12):** the MAIN selling points are **(1) privacy — your
  financial data stays in YOUR OWN Google Drive (zero-server), and (2) it's free.** Lead marketing
  with these two. The **"in Hebrew" angle is NOT the main seller** — do not headline with it.
  Invoicing/finance (חשבונית/קבלה, expenses, VAT/tax) is *what it does*; privacy + free is *why us*.
  (This supersedes an earlier mis-read that demoted privacy — see board decisions log.)

## Owner sync contract
- **Involvement:** **Approve every batch** — no batch starts building without owner go-ahead on the
  ticket batch. Orchestrator pulse: per-batch approval (LIFECYCLE.md owner pulse), plus stage gates
  and any cap-breach/prod-incident escalation.

## Platforms & repos
| Platform | Path / repo | Framework | Deploy target |
|----------|-------------|-----------|---------------|
| API      | none — zero-server (client calls Google APIs + Tax Authority directly) | — | — |
| Web      | repo root (`src/`) | React 19 + Vite + Tailwind, react-router 7 | Vercel (`vercel.json`) |
| iOS      | `@capacitor/ios` dep added (not yet a full target) | Capacitor 8 | App Store (future) |
| macOS    | planned | — | — |
| Android  | `android/` | Capacitor 8 | Google Play (future) |
| Windows  | not planned | — | — |

Launch order: **Web first**; Android next (Capacitor wrapper exists); iOS+macOS later.

## Architecture pointers (paths, not prose)
- API contract (OpenAPI): none — no owned backend. External APIs: Google Drive, Gmail, Israel Tax Authority.
- Client services: `src/services/` — `auth.ts`, `googleDrive.ts`, `gmail.ts`, `share.ts`, `pdf/`
  (a Tax Authority e-invoice/allocation service is **not built**; prior local WIP scrapped 2026-07-12)
- Tax/VAT (on main): `src/config/taxConfig.ts`, `src/pages/VatReportView.tsx`, `src/utils/vatReport.ts`
- State/context: `src/context/AuthContext.tsx`, `src/context/FinanceContext.tsx`
- Pages: `src/pages/` (Dashboard, Invoices, InvoiceForm, Expenses, Clients, BookingAgents, Taxes,
  Profile, TaxAuthCallback)
- i18n: `src/i18n/locales/{en,he}.json` (Hebrew RTL + English)
- Design tokens package: **not present in repo** (`packages/design-tokens/` referenced in a scaffold
  board thread does not exist here — design-expert to establish if/when needed)
- CI/CD workflows: none found (`.github/workflows` absent) — `assumption:` deploys via Vercel git integration
- Infra-as-code root: none (zero-server)
- **Health check / init commands (HARNESS §2 — run at every session start):** `npm install` then
  `npm run build` (`tsc -b && vite build`); dev server `npm run dev` (Vite :5173). Lint: `npm run lint`.
  **Baseline 2026-07-12:** build ✓ clean (bundle 474 KB gz); lint ✗ **132 pre-existing errors**
  project-wide → see FF-OPS-1 (not a blocker for unrelated work, but the lint gate is currently red).

## Environments
| Env | URL | Notes |
|-----|-----|-------|
| dev | `vite` local | `npm run dev` |
| prod| `assumption:` Vercel-hosted (URL TBD) | static SPA |

## Non-negotiables
- Data sensitivity class: **PII** (client names/contacts, business details) + **regulated financial
  data** (invoices, receipts, tax records under Israeli record-keeping law). No payment-card data —
  FinFlow does not process payments. → security-validator **blocking** on auth, Drive scopes, Tax
  Authority integration, and any PII/financial-data handling.
- Compliance constraints: **Israeli Tax Authority** — e-invoicing / allocation-number mandate,
  legal doc-type logic (receipt vs. tax invoice by Esek type), record retention. `assumption:` GDPR
  scope unconfirmed (serves individuals) — see TKT-SEC-1.
- Performance budgets: web bundle **474 KB gz measured 2026-07-12** (target < 500 KB gz — close;
  single 1.6 MB chunk, code-splitting candidate); `assumption:` interactive < 3s on mid-tier mobile,
  PDF generation < 2s (not yet measured).
- Monthly infra cost cap: **$0/mo hard** (zero-server; any paid infra needs CFO approval). See ops/COSTS.md.

## Known landmines
- RTL Hebrew correctness in generated PDFs (jspdf) — high-fidelity mirroring is fragile.
- Israeli legal doc-type logic: Esek Patur (receipt) vs Esek Morshe (tax invoice); split ID
  sequences (INV-XXXX vs RCPT-XXXX). Regressions here are compliance bugs.
- Tax Authority allocation numbers are captured **manually (interim)** today; real-time ITA
  integration is unbuilt and needs a backend (conflicts with the zero-server model — design decision).
- Google Drive is the datastore: `drive.file` scope only; data-loss / sync-conflict risk is on the client.
