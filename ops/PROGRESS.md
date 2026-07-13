# PROGRESS.md — live handoff + session log (harness memory, HARNESS.md)

The bridge between context windows: a fresh session restores full working state from the block
below, without re-analyzing the repo. The coordinator overwrites **Current handoff** at every
session end (§3 clean-state contract); the Session log is append-only, one line per session.

## Current handoff (overwrite at session end)

- **Repo state:** `main @ 9b8e380` clean/synced. **FF-DATA-4 (entity-split storage) MERGED & SHIPPED**
  2026-07-14 — owner live-drill passed 9/9. **Canary: owner's own account migrates first**; rollback
  anchor = redeploy `04c9de6` (caveat: post-migration edits absent from legacy `app_data.json`).
- **Health:** `npm run build` ✓ clean (bundle 477.84 KB gz, budget 500) · `npm run lint` ✗ 132 pre-existing (FF-OPS-1).
  Init: `npm install && npm run dev` (Vite :5173).
- **Storage model (as of 9b8e380):** per-business `manifest.json.gz` + per-entity gzipped shards
  (invoices/expenses/clients/bookingAgents); legacy `app_data.json` kept untouched as backup; saves
  upload only dirty shard(s) + manifest (manifest last); per-shard optimistic concurrency w/ guarded,
  merge-reconciled manifest writes; one-time migration claim→write→verify→finalize, idempotent.
  4f dual-write deliberately NOT built (owner decision). Spec: `ops/research/FF-DATA-4-entity-split-spec.md`.
- **In flight:** FF-DOC-1 — backend-platform updating vault `ARCHITECTURE.md` §6.2/6.3/7.1-7.3/13 (Loop C).
- **Shipped earlier:** rebrand FinFlow→tbiz (e82422b); FF-MKT-1 landing at /lp; FF-PM-1/PM-3 research closed.
- **Positioning:** lead with **privacy (data in user's own Google Drive) + free**; NOT "in Hebrew". Rivals Sumit+EZcount (both cloud → privacy is the edge).
- **Roster:** agent-team plugin agents ONLY.
- **Owner actions to activate the tbiz.co.il DOMAIN (rebrand code is already live; see `ops/REBRAND-owner-steps.md`):**
  the app now serves the tbiz build on the EXISTING domain (login unaffected — redirect is origin-relative).
  To go live on tbiz.co.il: 1. **Vercel:** connect tbiz.co.il + DNS. 2. **Google Cloud:** add tbiz.co.il OAuth
  origins/redirects + register Android `com.tbiz.app`+SHA-1 + rename consent screen (register BEFORE DNS cutover
  or login breaks on the new domain). 3. Post-cutover: 301s from finflow URLs + Search Console change-of-address.
- **Still open (unchanged):** run FF-PM-2 interviews; revoke old `ghp_…` token. Backlog: FF-OPS-1 (132 lint),
  FF-DATA-8 (settings-merge hardening), FF-DATA-5 (IndexedDB mirror — next data phase).
- **Canary watch (owner, next few days):** use the app normally on your real account; confirm in Drive that
  `manifest.json.gz` + 4 shards exist, `app_data.json` untouched, and edits only touch the edited shard
  (Drive revision history). Anything odd → rollback anchor above, and report FAST (rollback window caveat).

## Session log (append-only, newest last)

| Date | Session (agent · type) | Did (ticket IDs / outcome) | Left state |
|------|------------------------|----------------------------|------------|
| 2026-07-12 | orchestrator · initializer | v1.2.0 intake; PRODUCT/ROADMAP/COSTS + PROGRESS + boards; stage=Validate; health check; shipped FF-WEB-002 (notes); repo catch-up + auth hygiene | First batch (FF-PM-1/PM-2/MKT-1/PM-3) awaiting owner approval; restart pending |
| 2026-07-12 | orchestrator · dispatch | Ran validation batch via agent-team agents: FF-MKT-1 built + gated CLEAR (design/a11y, seo, cost); FF-PM-1/2/3 delivered; cfo CLEAR on FF-PM-3 | FF-MKT-1 pre-deploy follow-ups (vercel routing, copy, waitlist wiring); owner to name competitor + run interviews |
| 2026-07-12 | orchestrator · ship | Iterated FF-MKT-1 (privacy+free reposition, Hebrew fixes, dark-mode fix, Google Form wired, section removed); SEO re-gate CLEAR; committed team docs + landing; **merged to main & shipped /lp to prod** (640ad05); FF-PM-1 deep scan (Sumit+EZcount) | FF-MKT-1 DONE. Owner to run FF-PM-2 interviews; FF-PM-1/PM-3 In Review; revoke old token |
| 2026-07-12 | orchestrator · rebrand | FinFlow→tbiz full sweep via agent-team agents (FF-DATA-1 Drive migration, FF-WEB-3 app, FF-MKT-2 landing, FF-AND-1 Android, FF-INT-2 auth/owner-doc); all gates CLEAR (design/security/qa/seo); staged on `feat/rebrand-tbiz` for preview | NOT merged — owner must run Drive live-drill + Android build + Vercel/Google Cloud setup, then verify preview before prod merge |
| 2026-07-13 | orchestrator · rebrand-ship | Owner verified preview + ran Drive migration live-drill; **merged rebrand to main & shipped** (e82422b). FF-DATA-1/WEB-3/MKT-2/AND-1/INT-2 all Done | tbiz build live on existing domain; owner to connect tbiz.co.il in Vercel + Google OAuth to activate new domain |
| 2026-07-14 | orchestrator · data-4-ship | FF-DATA-4 built (4a-4e, 4f skipped), gated CLEAR (security ×2 incl. hardening, qa), owner live-drill 9/9, **merged & shipped** (9b8e380). FF-DATA-8 + FF-DOC-1 opened; FF-DOC-1 dispatched | Owner canary on own account; rollback anchor 04c9de6; FF-DOC-1 (ARCHITECTURE.md) in flight |
