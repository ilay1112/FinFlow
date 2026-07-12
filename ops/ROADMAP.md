# ROADMAP.md — priorities (owned by product-manager)

Ranked by **revenue impact per unit of effort** (RICE-lite: Reach × Impact ÷ Effort). The PM re-ranks
on new evidence (metrics, feedback, CFO revenue rows) and ticketizes the top items in REQUEST_FORMAT.
Append candidate items at the bottom; move them up only with stated evidence.

**Lifecycle stage: 1. Validate** (LIFECYCLE.md; lead: product-manager). The product is already built,
but demand is unvalidated — so the Now list is **validation work, not features**. Build only what
validation needs. Stage exit: 20+ waitlist signups, or 10+ problem interviews, or pre-orders.
Owner sync: **approve every batch**.

## Now (ticketized — validation)

| Rank | Item | Why now (evidence) | Tickets |
|------|------|--------------------|---------|
| 1 | Competitor scan — name & analyze the main Israeli invoicing rival | Owner picked "a competitor I'll name" (Phase 5.3) but didn't name it; must know what we're differentiating against before more build | FF-PM-1 |
| 2 | Problem interviews — 10 Israeli freelancers | Validation rests on owner conviction only (Phase 5.1); need real user evidence before feature work | FF-PM-2 |
| 3 | Landing page + waitlist (demand signal) | Channels = SEO/communities/own audience (Phase 5.2); a waitlist measures pull and feeds the stage-exit metric | FF-MKT-1 |
| 4 | Pricing hypothesis + willingness-to-pay | "Free now, monetize later" needs a testable price story before Monetize stage | FF-PM-3 |

## Next (specced, not started)

| Item | R×I÷E | Evidence |
|------|-------|----------|
| FF-OPS-1 — triage 132 project-wide lint errors | — | Health check 2026-07-12: `npm run lint` red; DoD lint gate blocked until addressed |
| Tax Authority e-invoicing / allocation numbers (real ITA integration) | — | Legal mandate; needs a backend (conflicts w/ zero-server) — post-validation build item |
| Document-type correctness (Esek Patur/Morshe, INV/RCPT sequences) | — | Compliance landmine; build-stage item |
| GDPR posture review | — | PII + EU-possible users; security research |
| Android Play Store release | — | Capacitor wrapper exists; platform roadmap step 2 |

## Later / icebox

<!-- One line each. Specs are written when an item enters Next — tokens go to work that will
actually happen. -->

## Shipped (last 10 — older rows to archive)

| Date | Item | Outcome metric |
|------|------|----------------|
| — | — | — |
