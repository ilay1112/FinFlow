# COSTS.md — cost ledger (owned by CFO)

Every recurring cost enters this ledger **before** it is incurred (WORKFLOW §10). The cost-validator
gates per-ticket cost deltas against the caps here; the CFO reviews monthly and ticketizes
downgrades/kills as `TKT-BIZ-n`. Append rows at the bottom of each table.

## Budget caps

| Category | Monthly cap | Hard/soft | Kill switch |
|----------|------------|-----------|-------------|
| Cloud infra (AWS/GCP/…) | $0 | hard | zero-server model — no owned backend permitted without CFO approval |
| SaaS subscriptions | $0 | soft | cancel list below |
| Paid APIs / model usage in product | $0 | hard | feature flag off |
| Agent-team model spend | $0 | soft | tier-down per TOKEN_POLICY §5 |
| **Total burn cap** | $0 | hard | CFO escalates to human owner |

> **Zero-server product.** FinFlow stores data in each user's own Google Drive; Google/Tax-Authority
> APIs are free-tier for the user. Web hosting on Vercel free tier. Any new recurring cost breaks the
> $0 cap and requires CFO sign-off before it is incurred.

## Recurring costs

| Item | Vendor | $/mo | Category | Owner ticket | Since | Justification (1 line) | Kill/downgrade path |
|------|--------|------|----------|--------------|-------|------------------------|---------------------|
| — | — | — | — | — | — | — | — |

## Cost deltas (per merged ticket — cost-validator appends)

| Date | Ticket | Est Δ$/mo | Actual Δ$/mo | Note |
|------|--------|-----------|--------------|------|
| 2026-07-12 | FF-MKT-1 | $0 | — | Waitlist capture: Google Form (recommended), Formspree 50/mo (risk cliff), or Apps Script (unlimited). No paid vendor. Vercel free tier. |
| — | — | — | — | — |

## Monthly reviews (CFO appends)

<!-- ### YYYY-MM — total burn $X vs cap $Y · actions: TKT-BIZ-n, ... -->

## Revenue (CFO appends, feeds PM prioritization)

| Month | MRR | Paying users | Churn % | Note |
|-------|-----|--------------|---------|------|
| — | — | — | — | — |
