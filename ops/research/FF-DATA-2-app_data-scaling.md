# FF-DATA-2 — `app_data.json` scaling report

**Owner:** backend-platform · **Type:** REPORT (read-only analysis, no code changed) · **Date:** 2026-07-13

**Scope:** how `app_data.json` (the per-business Google Drive JSON blob that is FinFlow's entire
database — zero-server model) behaves today, where it breaks down as data grows, and what the
correct fix looks like *within* the Drive-as-database constraint. No vendor/infra change — hard
$0/mo cap (`ops/PRODUCT.md` Non-negotiables).

**Grounding:** `src/services/googleDrive.ts` (full read), `src/context/FinanceContext.tsx` (full
read), `src/utils/appStateSchema.ts` (full read), `ARCHITECTURE.md` §6 (Data Model) + §7
(Persistence & Sync Engine), `ops/PRODUCT.md`. Size estimates below are computed (Node.js
`JSON.stringify`/`zlib.gzipSync` on realistic synthetic records shaped exactly like the app's
`Invoice`/`Expense`/`Client` types), not guessed.

---

## 1. Current model

**One file per business, always read/written whole.** Already correctly sharded by business —
each workspace gets its own `<Business Name>/app_data.json` (`googleDrive.ts:230-247`,
confirmed by `ARCHITECTURE.md` §6.3) — so a user with 5 businesses has 5 independent, smaller
files, not one giant one. Everything below is about the ceiling on a *single* business's file.

**Load path** (`FinanceContext.tsx:499-596`, `googleDrive.ts:252-262`):
1. `fetchAppState()` — one `GET .../files/{id}?alt=media` (full-file download), `response.json()`
   (full parse), then `normalizeAppState(raw)` — a full recursive walk of every expense/invoice/
   client/agent that rebuilds every record field-by-field (`appStateSchema.ts:286-298`).
2. `getFileVersion()` — a second round-trip, just to read the Drive `version` metadata field, used
   as the optimistic-concurrency token (`googleDrive.ts:307-314`).
3. `mergeAppState(localSnapshot, driveData)` if a same-workspace local cache exists — unions
   **every** collection by id (`googleDrive.ts:316-343`), an O(n) rebuild of the full arrays even
   when nothing conflicted.
4. `seedDocCounters(loadedInvoices, ...)` — one more full pass over `invoices` on every load
   (`FinanceContext.tsx:557`).

**Save path** (`FinanceContext.tsx:598-646`, `googleDrive.ts:289-399`): a single `useEffect`
watches all six pieces of state (`expenses, categories, clients, invoices, bookingAgents,
businessSettings`). **Any** single-field edit to **any** entity — e.g. changing one expense's
category — re-fires this effect, which after a 1s debounce calls `flushToDrive` →
`saveAppStateGuarded` → `saveAppState`, which `PATCH`es `uploadType=media` with
`JSON.stringify(data)` of the **entire** `AppState` (`googleDrive.ts:289-301`). There is no
partial/diff write anywhere in this pipeline — **100% write amplification**: a 50-byte edit costs
a full-file upload, every time.

**Optimistic concurrency** (`saveAppStateGuarded`, `googleDrive.ts:372-399`): checks the file's
Drive `version` against the last-seen one; on a conflict it re-`fetchAppState`s the **entire
remote file** and retries (up to 4 attempts), each attempt costing another full download + full
merge. The whole state (not a diff) is the unit of both the read and the write in every branch of
this loop.

**Net effect:** the file is durable, safe (guarded, merged, retried, localStorage-backed,
normalized against untrusted edits), but architecturally it treats the entire business's
financial history as one atomic, monolithic blob for both the smallest and largest possible edit.

---

## 2. What happens as it grows

Computed realistic per-record sizes (synthetic records shaped exactly like `Invoice`/`Expense`/
`Client` in `FinanceContext.tsx:75-219`, run through `JSON.stringify`):

| Entity | Avg size (raw JSON) |
|---|---|
| Invoice (2 items, payment line, Hebrew client name, allocation number, notes) | **~600–900 B** |
| Expense (VAT fields populated, receipt linked) | **~420–500 B** |
| Client | **~195–230 B** |

A mixed realistic dataset — 800 invoices + 1200 expenses + 300 clients (roughly a busy Osek
Morshe's 2–3 years of activity: ~25 invoices/mo + ~35 expenses/mo) — measured at:

- **Raw JSON: ~1.06 MB**
- **Gzipped: ~181 KB (17% of raw)** — Hebrew text + repeated key names compress very well.

Projected milestones for a single business:
| File size | Rough record count | Time to reach (active Osek Murshe, ~25 inv + ~35 exp/mo) |
|---|---|---|
| ~500 KB | ~400 invoices + ~600 expenses | ~14–16 months |
| ~1 MB | ~800 invoices + ~1200 expenses | ~2.5–3 years |
| ~5 MB | ~4000 invoices + ~6000 expenses | ~10+ years (rare — but a Company with many line-item-heavy invoices, or a booking-agent-heavy business with more `paymentLines`, gets there materially faster) |

**Where this bites, concretely:**

- **Download latency (mobile/slow networks).** At ~1 MB the raw-JSON download (no compression
  today — see below) is a real wait on cellular/3G-class connections (multi-second), and it
  happens on **every workspace load** — cold start, every business switch (`activeBusiness`
  change re-runs `syncFromDrive`, `FinanceContext.tsx:499-596`), and every reconnect flush.
- **`JSON.parse` + `normalizeAppState` CPU cost.** `normalizeAppState` is not a cheap pass-through
  — it recursively strips dangerous keys, coerces every field's type, and rebuilds every array
  element (`appStateSchema.ts:57-70, 286-298`). This is O(n) over every record on **every single
  load**, not just the first. At a few thousand records this is tens-of-milliseconds territory on
  desktop but meaningfully more on a mid-tier Android WebView (the product's stated native target,
  `ARCHITECTURE.md` §2/§9) — and it re-runs identically on every reload, not just the first.
- **Memory.** The full parsed state, plus a second full copy mirrored into six separate
  `localStorage` keys as JSON strings on **every state change** (`FinanceContext.tsx:613-619`,
  synchronous `JSON.stringify` of the whole array each time) — so a growing file means growing
  main-thread work on every keystroke-adjacent edit, not just load.
- **Write amplification.** As established in §1, every edit — of any size — re-uploads the whole
  file. At 1 MB, a user who edits 10 expenses in a session generates ~10 MB of Drive upload
  traffic for what is actually ~5 KB of real change. This scales linearly and unfavorably with
  file size and has no ceiling built in.
- **Longer optimistic-concurrency conflict window.** `saveAppStateGuarded`'s retry loop
  (`googleDrive.ts:383-394`) does a full `getFileVersion` + full `fetchAppState` + full merge on
  every conflict; the bigger the file, the longer each retry iteration takes, which widens the
  window in which a second concurrent write can land and trigger *another* conflict — the loop is
  capped at 4 attempts (`MAX_ATTEMPTS`), so a genuinely slow large-file round-trip on a bad
  connection has a real (if currently unquantified) chance of exhausting retries under
  multi-device contention, at which point the code force-saves "the best merged result anyway"
  (`googleDrive.ts:396-398`) — not silent data loss (merge-by-id still applies), but a wider
  window for a lost race than a small file would have.
- **Google Drive API practical limits.** The save path uses `uploadType=media`
  (`googleDrive.ts:290`) — Drive's simple/media upload endpoint is documented to require a
  resumable upload above 5 MB request bodies; this is a hard behavioral cliff, not a performance
  slope, that this app's single-shot fetch-based save would hit and fail against once a business's
  file crosses that line (per the projection table, a very high-volume Company account, not a
  typical freelancer, within realistic multi-year horizons). Below that, Drive API v3 has no other
  documented size-based throttle specific to this pattern, but per-user request-rate quota does
  apply to the several sequential calls each load/save already issues (`findFileId` ×2–3,
  `fetchAppState`, `getFileVersion`, `saveAppState`, and up to 4× more on a conflict retry) — more
  records doesn't change call *count*, but slower per-call latency at larger payload sizes
  increases the chance of hitting a request-timeout-driven retry storm under quota pressure.

---

## 3. Effect on loading time — the critical path

Walking `FinanceContext.tsx:499-596` in order:

```
auth ready (getValidAccessToken)
  → initAppState (2–3 sequential Drive `files.list`/`files.create` calls to resolve
    root folder → business folder → app_data.json, googleDrive.ts:230-247)
      → fetchAppState: GET ?alt=media  ── grows linearly with file size (network) ──┐
      → getFileVersion: GET ?fields=version  ── flat cost, unaffected by size ──┐    │
      → JSON.parse (inside fetchAppState, response.json())  ── grows with size ┘    │
      → normalizeAppState: full recursive rebuild of every record ── grows with size┘
      → mergeAppState (if a same-workspace local cache exists): full union-by-id
        over every collection ── grows with size
      → seedDocCounters: full pass over invoices ── grows with size
  → setExpenses/setInvoices/setClients/... → React re-render of Dashboard/lists
```

Every stage after `initAppState`'s folder resolution scales with file size — **and it reruns in
full on every business switch**, not just the first app load. There is currently no lazy-load,
no "load recent, fetch older later," and no way to render the dashboard before the whole file is
in memory. **Every save also re-runs the network leg of this path** (a version check + full
upload, §1) — so the "loading time" cost isn't a one-time hit at boot, it recurs on the 1-second
debounce after every edit.

---

## 4. Correct ways to handle this within the zero-server Drive constraint

| Approach | What it does | Preserves current merge/concurrency model? | Complexity | Payoff | Honest verdict |
|---|---|---|---|---|---|
| **gzip compression before upload** | Compress the JSON body before `saveAppState`'s PATCH, decompress after `fetchAppState`'s GET (Drive stores/serves arbitrary bytes; content-type can stay `application/json` with the app handling the encode/decode itself, or store as a `.json.gz`-equivalent and decompress client-side — Drive itself doesn't gzip-transcode on `alt=media`). Our measurement: **~83% size cut** (1.06 MB → 181 KB) on realistic data. | **Yes** — pure transport-layer change, `version`/merge/normalize logic untouched. | Low (a `pako`/`CompressionStream` wrapper around 2 call sites) | High per unit of effort — cuts download/upload time and bytes ~5–6× immediately, no logic change | **Best first move** — nearly free, zero risk to the merge model, immediate win on the #1 pain point (network transfer). Does *not* fix write amplification or parse/normalize CPU cost (still full-file parse after decompress). |
| **Write only the changed shard (entity-level file splitting: `invoices.json` / `expenses.json` / `clients.json` / `settings.json`)** | Split the one file into one-per-entity-type files in the business folder. An edit to one expense only re-uploads `expenses.json`, not invoices/clients/settings. | **Mostly** — `saveAppStateGuarded`'s per-collection version-check-then-merge pattern maps naturally onto per-file versions (each file gets its own Drive `version` token); `mergeAppState`'s per-collection union-by-id logic is literally already partitioned this way (`googleDrive.ts:334-343`) and barely needs to change. | Medium — more Drive files to find-or-create (`initAppState` grows from 1 file to ~4–5), more round-trips on a *cold* load (though these can run in parallel via `Promise.all`), save logic needs to know which collection(s) actually changed per edit (currently the effect fires on the combined dependency array with no per-field diffing) | High — directly kills write amplification (the core problem) and shrinks the per-edit upload to just the touched entity type | **The correct structural fix.** This is the single highest-leverage change and should be the second phase. The one real complication: today's save effect doesn't know *which* entity changed (it just serializes everything on any change) — `flushToDrive` would need per-collection dirty tracking, which is a real (but bounded) refactor of `FinanceContext.tsx`'s save pipeline. |
| **Sharding by year** (e.g. `invoices/2026.json`, `invoices/2025.json`) | Further splits each entity file by year, so an edit to a 2026 invoice never touches the 2024 file. | Yes, same reasoning as above, one layer deeper | Medium-high — adds year-resolution logic to every read (which years does a report need?), and cross-year queries (annual VAT report, income-tax estimate, `computeYtdTurnover`) need to fan out across files | Real payoff only once a *single entity type* itself is large (multi-MB) | **Not yet justified.** At the projected growth in §2, even a heavy business's `invoices.json` alone stays in the tens-to-low-hundreds of KB range for years — this is a future optimization if entity splitting alone isn't enough, not a near-term need. Worth deferring until real usage data shows an entity file crossing ~1–2 MB. |
| **Append-only/delta log instead of full-blob rewrite** | Instead of overwriting the whole file, append a small "operation" record (add/update/delete) to a log; periodically compact. | **No — needs rework.** The current `version`-based optimistic-concurrency + union-merge model assumes "the file's full current state," not a stream of ops; a delta log needs its own replay/compaction logic and a different conflict model (op-based CRDT-ish merge, not id-union). | High | High once built, but high build/verification cost given no backend and no server-side compaction job (a client would have to compact on load, which reintroduces a full-file operation anyway) | **Not recommended for this stack.** Its payoff (avoiding full-rewrite cost) is achieved more simply and safely by entity-level splitting; the delta-log's extra complexity (replay correctness, compaction races between devices, larger code surface for a financial-data app that must not corrupt) isn't justified when a much simpler fix gets most of the same benefit. |
| **Pagination/lazy-loading (load recent, fetch older on demand)** | Only load, say, the current + prior VAT period's invoices/expenses on open; fetch older records on demand (viewing an old year, running an annual report). | Partially — works cleanly once data is already entity+year sharded (previous rows); doesn't make sense against a single monolithic file (you'd still have to parse the whole file to know what's "recent"). | Medium (once sharded by year) / not meaningful before that | High for perceived load time on an old, large account | **Good complementary UX layer, not a standalone fix.** Depends on the year-sharding groundwork above; implement only after that structural split exists, and even then only for pages/reports that don't need full history (Dashboard, Expenses/Invoices list default view) — VAT report and turnover math (`computeYtdTurnover`, annual tax estimate) fundamentally need full-year (or full-history) data and can't lazy-load away that requirement. |
| **IndexedDB local cache + sync diffs** | Replace/augment the `localStorage` full-JSON-string mirror (`FinanceContext.tsx:613-619`) with IndexedDB, storing records individually (not as one giant string), and sync only diffs against Drive. | Would require rebuilding the current localStorage-mirror + merge logic on a different local-storage primitive | Medium-high (IndexedDB API is more complex than `localStorage.setItem`, needs a migration path for existing users' `finance_*` keys) | Solves the *local* mirror's "stringify everything on every change" cost (`FinanceContext.tsx:613-619`), independent of the Drive side | **Worth doing, but secondary to the Drive-side fix.** `localStorage`'s ~5–10 MB per-origin quota is nowhere close today (a 1 MB state stringified across 6 keys is well under it), so this addresses a real but currently-non-urgent inefficiency (needless full re-serialization on every keystroke-adjacent edit) rather than the more urgent Drive-transfer/write-amplification problem. Good candidate for a later phase once file-size approaches the point where `JSON.stringify`-the-whole-thing-on-every-edit starts costing visible main-thread time. |
| **Debounced/batched writes of only the changed shard** | Combine the existing 1-second debounce (`FinanceContext.tsx:642-644`) with entity-level splitting: batch same-shard edits within the debounce window, write only shards that actually changed. | Yes — this is really "entity splitting" (row 2) plus keeping the existing debounce; not a separate mechanism | Low once entity splitting exists | High — this is the actual mechanism that realizes entity-splitting's write-amplification win in practice | **Not a separate option — this is how entity splitting gets wired into the existing save effect.** Call out as an explicit sub-step of Phase 2 below, not a standalone ticket. |

---

## 5. Recommendation

**Phased plan**, cheapest/lowest-risk first. Each phase respects the $0/mo infra cap (client-side
only, no new vendor) and is written up here for the orchestrator to ticket.

### Phase 1 — FF-DATA-3: gzip compression on the Drive read/write path
- **What:** compress the `JSON.stringify`d body before `saveAppState`'s upload; decompress after
  `fetchAppState`'s download. Use the browser's native `CompressionStream`/`DecompressionStream`
  (no new dependency, Capacitor WebViews support it) or a small `pako` dependency if native
  compression proves inconsistent across the iOS/Android WebView targets.
- **Why first:** ~83% size reduction measured on realistic data (§2), zero change to the
  optimistic-concurrency/merge model, smallest possible diff (2 call sites:
  `googleDrive.ts:252-262` and `:289-301`).
- **Watch-outs:** must handle a **not-yet-compressed legacy file** gracefully on first load after
  shipping (a user's existing plain-JSON `app_data.json` won't be gzip-magic-byte-prefixed) —
  needs a format-sniff-and-fall-back-to-plain-parse on read, and every write from that point
  onward writes the new compressed format. This is a compatibility detail, not a redesign.
- **Rough effort:** S (1–2 days incl. the legacy-format fallback + a normalize-path test).

### Phase 2 — FF-DATA-4: entity-level file splitting (the structural fix)
- **What:** split `app_data.json` into `invoices.json`, `expenses.json`, `clients.json`,
  `booking_agents.json`, `settings.json` (categories can live in `settings.json` — it's small and
  changes rarely) inside each business folder. Each file gets its own Drive `version` token; the
  existing `saveAppStateGuarded`/`mergeAppState` pattern (already partitioned by collection,
  `googleDrive.ts:334-343`) extends naturally to "one guarded save per changed file" instead of
  one guarded save of everything.
- **Why second:** this is what actually kills write amplification (§1's core finding) — the
  problem gzip alone doesn't touch.
- **Requires:** adding per-collection dirty-tracking to `FinanceContext`'s save effect (today it
  has no notion of *which* piece changed — `FinanceContext.tsx:599-646` treats the combined
  dependency array as one unit). This is the real engineering lift in this phase, not the Drive
  I/O itself.
- **Migration:** on first load after shipping, read the legacy single `app_data.json` if present,
  split it into the new per-entity files, then treat it as migrated (analogous pattern already
  proven safe in FF-DATA-1's root-folder rename — metadata-only, idempotent, `console.warn` on any
  ambiguous partial-migration state).
- **Rough effort:** M (3–5 days: file-shape change, dirty-tracking refactor, migration path,
  updated load/save tests).

### Phase 3 — FF-DATA-5: IndexedDB local mirror
- **What:** replace the six `localStorage.setItem(JSON.stringify(wholeArray))` calls
  (`FinanceContext.tsx:613-619`) with an IndexedDB store keyed by record id, written
  incrementally (only the changed record), read back into the same in-memory shape on boot.
- **Why third, not first:** addresses local main-thread re-serialization cost, which only becomes
  visible once state size is meaningfully larger than today's typical account (§2) — real but not
  urgent relative to Phases 1–2.
- **Rough effort:** M (3–4 days incl. a `finance_*` → IndexedDB migration path, keeping
  `financeCache.ts`'s wipe-on-logout/account-switch guarantee intact for the new store).

### Deferred / not recommended now
- **Sharding by year** and **pagination/lazy-load** — real techniques, but only pay off once a
  *single entity file* (post Phase 2) itself grows large; premature before that. Revisit as
  FF-DATA-6/7 if usage data post-Phase-2 shows an entity file crossing ~1–2 MB, and note that VAT/
  turnover reporting fundamentally needs full-year(s) data so lazy-load can only ever cover the
  default list views, not the compliance math.
- **Append-only/delta log** — not recommended for this codebase; its complexity (replay,
  compaction, a different conflict-resolution model) isn't justified when entity-level splitting
  achieves most of the same write-amplification win with far less risk to a financial-record store
  that must never corrupt.

---

## Executive summary (for the board)

- **Current model:** one monolithic `app_data.json` per business (already correctly sharded by
  business, not by size); every load fully downloads+parses+normalizes it, and **every single-field
  edit re-uploads the entire file** after a 1s debounce, no diffing anywhere in the pipeline.
- **Top 3 risks as it grows** (computed, not guessed — see §2): (1) **write amplification** — a
  5 KB real edit costs a full-file (eventually multi-hundred-KB to MB) upload every time, with no
  ceiling; (2) **load-time growth** — download + `JSON.parse` + `normalizeAppState`'s full
  recursive rebuild all scale with file size and rerun on *every* business switch, not just first
  boot; (3) **wider optimistic-concurrency conflict window** — bigger files make each conflict-retry
  round-trip slower, increasing (if still bounded to 4 attempts) the chance of exhausting retries
  under real multi-device contention.
- **#1 recommendation:** ship gzip compression first (FF-DATA-3) — ~83% size cut measured on
  realistic data, touches only 2 call sites, zero risk to the existing merge/concurrency model —
  then do the real structural fix, entity-level file splitting (FF-DATA-4), which is what actually
  eliminates write amplification.
- **Phased tickets:** **FF-DATA-3** (gzip compression, S, 1–2 days) → **FF-DATA-4** (entity-level
  file splitting + per-collection dirty tracking, M, 3–5 days) → **FF-DATA-5** (IndexedDB local
  mirror, M, 3–4 days) → deferred **FF-DATA-6/7** (year-sharding, pagination) only if post-Phase-2
  usage data shows a single entity file crossing ~1–2 MB. No new vendor/infra cost at any phase —
  all client-side, $0/mo cap respected.
