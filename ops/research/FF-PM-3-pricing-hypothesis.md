# FF-PM-3 — Pricing hypothesis (draft, not a commitment)

**Status:** In Review — gate: **agent-team:cfo** must review before any tier is priced/built. This
document is a testable hypothesis to fold into FF-PM-2's interviews and FF-MKT-1's waitlist, per
`ops/PRODUCT.md` Identity: "Free now, monetize later. `assumption:` future paid tier(s) undefined —
revenue model to be decided after validation." Nothing here authorizes building billing, paywalls,
or Stripe integration — that is out of scope for the Validate stage.

**Owner:** product-manager · **Ticket:** FF-PM-3 · **Date:** 2026-07-12

## Why draft pricing now, in a "free now, monetize later" stage
`ops/ROADMAP.md` Now-list rank 4 states the rationale: "'Free now, monetize later' needs a testable
price story before Monetize stage." A price hypothesis lets FF-PM-2's Q10 willingness-to-pay
question be interpreted against real anchors ("would ₪X/mo feel fair?") instead of an open-ended
number that's hard to compare across interviews. This is discovery input, not a launch plan.

## Benchmark: what the market charges (from FF-PM-1)

| Vendor | Entry tier | Entry price/mo | Mid tier | Mid price/mo | Top tier | Top price/mo |
|---|---|---|---|---|---|---|
| Morning (Green Invoice) | Basic (20 docs, 1 biz) | ₪29 | Extra (200 docs, 3 biz) | ₪89 | Prime (500 docs, 5 biz) | ₪155 |
| EZcount/Hyp | Givol (50 docs, 1 user) | ₪24 | Mata (300 docs, 10 users) | ₪49 | Pardes (unlimited + payments) | ₪79 |
| iCount | pay-per-doc, ~10 docs | ~$5 (~₪18–19) | ~200 docs | ~$16 (~₪59) | 1,000+ docs | ~$0.045/doc |

Read: the Israeli market's **entry-tier anchor sits at roughly ₪24–29/mo** for a solo
freelancer/low-volume user, and **₪49–89/mo** is the common "serious small business" mid-tier. All
three competitors meter by document volume; none currently gates by Esek Patur vs. Esek Morshe
status (per FF-PM-1's `assumption:` flag — unconfirmed behind their signup flows).

## Candidate tiers (hypothesis — test before build)

These are shaped to test **what freelancers value**, not to replicate competitors' document-metering
model — FinFlow's zero-server architecture means marginal document cost is genuinely ~$0 to FinFlow
(no server-side generation/storage cost per doc), so a document-count paywall would be copying a
competitor constraint FinFlow doesn't actually have. `assumption:` this is the differentiator worth
pricing around, not volume — confirmed pending CFO unit-economics review and interview data.

### Option A — Free forever + single paid "Pro" tier
| Tier | Price | What's gated |
|---|---|---|
| Free | ₪0 | Full core: invoicing, expenses, clients, tax tracking, Drive storage — unlimited documents (no server cost to meter) |
| Pro | ₪19/mo (₪190/yr, ~2 months free) | Booking-agent commission tracking, multi-business support, PDF customization/branding, priority feature requests |
**Rationale:** undercuts every competitor's entry tier by pricing below Morning/EZcount's ₪24–29
floor, while gating on features that map to power-user behavior (agents, multi-business) rather than
volume — the one axis where FinFlow's zero-server model genuinely has no cost floor. Simplest to
explain and cheapest to build (one paywall, not three).

### Option B — Three tiers mirroring competitor mental models (familiar, easier upsell path)
| Tier | Price/mo | Price/yr | What's gated |
|---|---|---|---|
| Free | ₪0 | ₪0 | Core invoicing/expenses/clients, 1 business |
| Plus | ₪15/mo | ₪150/yr | Multi-business (up to 3), booking-agent commissions |
| Pro | ₪35/mo | ₪350/yr | Everything in Plus + PDF branding/customization, priority support, (future) ITA allocation-number automation |
**Rationale:** lands below Morning's Best (₪54) and EZcount's Mata (₪49), giving room to raise prices
later without crossing the market's mid-tier anchor. Reserves the highest tier for the
allocation-number-automation gap flagged in FF-PM-1 — if that gets built post-validation, it's a
natural premium hook competitors already charge indirectly for (bundled into their base cloud cost).

### Option C — Pay-what-you-want / tip jar (lowest-commitment test)
| Tier | Price |
|---|---|
| Free (all features) | ₪0 |
| Optional support | owner-set suggested ₪10–20/mo, no feature gate |
**Rationale:** the cheapest possible test of willingness-to-pay without building any paywall logic
or losing free-tier users to a competitor over a feature gate — useful **only** as a bridge signal
if FF-PM-2 interviews show strong emotional pain but low tolerance for a hard paywall this early.
Not a real revenue model; a signal-collection option.

## Recommendation (hypothesis, pending CFO + interview data)
Lead FF-PM-2 interviews and the FF-MKT-1 waitlist survey toward **Option A or B** framing (feature-
gated, not volume-gated) — it's the framing most consistent with FinFlow's actual zero marginal
cost, and cheapest for backend-platform to eventually enforce (a feature flag per user record in
Drive-stored app state, no per-document counting/metering logic needed). Option C is a fallback if
interviews show resistance to any gate.

**Do not commit to a number yet.** This is `assumption:` pricing pending: (1) CFO review of FinFlow's
actual unit economics (there are none yet — $0 cost today, so "unit economics" here means what
percentage of free users would plausibly convert, not COGS), (2) FF-PM-2 interview willingness-to-pay
data, (3) FF-MKT-1 waitlist signal.

## Willingness-to-pay questions to fold into FF-PM-2 interviews
FF-PM-2's Q10 already asks an open WTP question. Add these as **optional follow-ups** if the
interview has time and the candidate engaged well with Q10 (do not turn the interview into a pricing
survey — problem discovery is the primary goal):

1. "אם הכלי היה חינמי לגמרי אבל מבקש תמיכה וולונטרית — היית תומך/ת? כמה?" / "If the tool were
   completely free but asked for voluntary support, would you contribute? How much?" (tests Option C)
2. "אם תכונה ספציפית (למשל מעקב עמלות סוכן הזמנות) הייתה בתשלום בזמן שהליבה חינמית — זה היה סביר
   בעיניך?" / "If one specific feature (e.g. booking-agent commission tracking) were paid while the
   core stayed free, would that feel fair?" (tests Option A/B's feature-gate framing)
3. "מה היית מצפה/ה לקבל בתמורה ל-₪19 בחודש, בהשוואה למה שאת/ה מקבל/ת היום מ[הכלי שהזכרת קודם]?" /
   "What would you expect to get for ₪19/month, compared to what you get today from [the tool they
   mentioned earlier]?" (anchors against Option A's number specifically, and against their actual
   current tool — not a hypothetical competitor)

## `assumption:` flags
- `assumption:` zero marginal cost per document is a valid basis for a feature-gated (not
  volume-gated) pricing model — needs CFO confirmation that no future architecture (e.g. a backend
  for ITA allocation-number automation) reintroduces a per-user server cost that would justify
  volume metering after all.
- `assumption:` ₪15–35/mo range is competitive without interview/waitlist data confirming Israeli
  freelancers' actual price sensitivity — purely benchmarked against competitor list prices, not
  against FinFlow's own perceived value.
- `assumption:` none of these tiers are being built this cycle — Validate stage scope is hypothesis
  + interview questions only, per `ops/ROADMAP.md`'s Now list (validation work, not features).

## Gate
**agent-team:cfo** — review unit-economics framing (Option A/B/C) and flag before any tier informs
a build ticket. Do not proceed to a pricing-enforcement ticket (backend-platform) without CFO
sign-off logged on `TEAM_BOARD.md`.
