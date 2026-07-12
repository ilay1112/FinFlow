# PROGRESS.md — live handoff + session log (harness memory, HARNESS.md)

The bridge between context windows: a fresh session restores full working state from the block
below, without re-analyzing the repo. The coordinator overwrites **Current handoff** at every
session end (§3 clean-state contract); the Session log is append-only, one line per session.

## Current handoff (overwrite at session end)

- **Repo state:** `main @ e82422b` clean/synced. **Rebrand FinFlow→tbiz MERGED & SHIPPED to prod**
  (owner ran the Drive live-drill + verified preview). App now brands as **tbiz**; Drive migration active.
- **Health:** `npm run build` ✓ clean (bundle 474 KB gz) · `npm run lint` ✗ 132 pre-existing (FF-OPS-1).
  Init: `npm install && npm run dev` (Vite :5173).
- **REBRAND FinFlow→tbiz (lowercase; domain tbiz.co.il) — all 5 tickets built + ALL GATES CLEAR:**
  - FF-DATA-1 (`googleDrive.ts`): Drive folder `FinFlow Data`→`tbiz Data` via metadata-only rename
    (`resolveRootFolderId`, 4 cases, idempotent). security+qa CLEAR on code. **Needs owner LIVE DRILL** (qa's 6-step plan).
  - FF-WEB-3: app UI/SEO/i18n/email/package/README → tbiz. design+seo+security CLEAR.
  - FF-MKT-2: landing page + domain→tbiz.co.il/lp. design+seo CLEAR.
  - FF-AND-1: `capacitor.config.ts` → `com.tbiz.app`/tbiz (android/ gitignored, regen'd). **Needs owner Gradle build.**
  - FF-INT-2: auth confirmed domain-clean; owner steps in `ops/REBRAND-owner-steps.md`.
- **Prior batch (all DONE):** FF-MKT-1 shipped to /lp; FF-PM-1 (Sumit+EZcount), FF-PM-3 (pricing, cfo CLEAR) closed.
- **Positioning:** lead with **privacy (data in user's own Google Drive) + free**; NOT "in Hebrew". Rivals Sumit+EZcount (both cloud → privacy is the edge).
- **Roster:** agent-team plugin agents ONLY.
- **Owner actions to activate the tbiz.co.il DOMAIN (rebrand code is already live; see `ops/REBRAND-owner-steps.md`):**
  the app now serves the tbiz build on the EXISTING domain (login unaffected — redirect is origin-relative).
  To go live on tbiz.co.il: 1. **Vercel:** connect tbiz.co.il + DNS. 2. **Google Cloud:** add tbiz.co.il OAuth
  origins/redirects + register Android `com.tbiz.app`+SHA-1 + rename consent screen (register BEFORE DNS cutover
  or login breaks on the new domain). 3. Post-cutover: 301s from finflow URLs + Search Console change-of-address.
- **Still open (unchanged):** run FF-PM-2 interviews; revoke old `ghp_…` token. FF-OPS-1 (132 lint) still Next.

## Session log (append-only, newest last)

| Date | Session (agent · type) | Did (ticket IDs / outcome) | Left state |
|------|------------------------|----------------------------|------------|
| 2026-07-12 | orchestrator · initializer | v1.2.0 intake; PRODUCT/ROADMAP/COSTS + PROGRESS + boards; stage=Validate; health check; shipped FF-WEB-002 (notes); repo catch-up + auth hygiene | First batch (FF-PM-1/PM-2/MKT-1/PM-3) awaiting owner approval; restart pending |
| 2026-07-12 | orchestrator · dispatch | Ran validation batch via agent-team agents: FF-MKT-1 built + gated CLEAR (design/a11y, seo, cost); FF-PM-1/2/3 delivered; cfo CLEAR on FF-PM-3 | FF-MKT-1 pre-deploy follow-ups (vercel routing, copy, waitlist wiring); owner to name competitor + run interviews |
| 2026-07-12 | orchestrator · ship | Iterated FF-MKT-1 (privacy+free reposition, Hebrew fixes, dark-mode fix, Google Form wired, section removed); SEO re-gate CLEAR; committed team docs + landing; **merged to main & shipped /lp to prod** (640ad05); FF-PM-1 deep scan (Sumit+EZcount) | FF-MKT-1 DONE. Owner to run FF-PM-2 interviews; FF-PM-1/PM-3 In Review; revoke old token |
| 2026-07-12 | orchestrator · rebrand | FinFlow→tbiz full sweep via agent-team agents (FF-DATA-1 Drive migration, FF-WEB-3 app, FF-MKT-2 landing, FF-AND-1 Android, FF-INT-2 auth/owner-doc); all gates CLEAR (design/security/qa/seo); staged on `feat/rebrand-tbiz` for preview | NOT merged — owner must run Drive live-drill + Android build + Vercel/Google Cloud setup, then verify preview before prod merge |
| 2026-07-13 | orchestrator · rebrand-ship | Owner verified preview + ran Drive migration live-drill; **merged rebrand to main & shipped** (e82422b). FF-DATA-1/WEB-3/MKT-2/AND-1/INT-2 all Done | tbiz build live on existing domain; owner to connect tbiz.co.il in Vercel + Google OAuth to activate new domain |
