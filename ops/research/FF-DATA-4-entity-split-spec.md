# FF-DATA-4 — Entity-split + gzip + safe migration: implementation-ready design spec

**Owner:** backend-platform (design) · **Type:** SPEC (design/spec only — no product code changed
this session) · **Date:** 2026-07-13 · **Implements:** web-developer next · **Gates:** security +
qa (blocking, per Ticket Index) · **Live migration drill:** owner, mirroring FF-DATA-1's style.

**Supersedes/folds in:** FF-DATA-3 (gzip) — per the Ticket Index, gzip ships as part of this same
transport layer rather than as a separate phase, since the split-file model and the compression
wrapper touch the exact same two read/write call sites.

**Grounding (re-read this session, full files):**
- `src/services/googleDrive.ts` — `initAppState` (:230-247), `fetchAppState`/`saveAppState`
  (:252-262, :289-301), `saveAppStateGuarded` (:372-399), `mergeAppState`/`mergeById`
  (:316-343), `resolveRootFolderId` (:181-205, the FF-DATA-1 precedent this migration's ordering
  is modeled on), `renameFile` (:144-159), `AppState` interface (:15-22, **no schema-version field
  exists today**).
- `src/context/FinanceContext.tsx` — hydrate-from-localStorage effect (:341-378), fetch-businesses
  effect (:381-422), `flushToDrive` (:431-493), sync-from-Drive load effect (:499-596), the
  single combined auto-save effect (:598-646), reconnect effect (:653-665), logout flush-and-clear
  (:667-715), `hasUnsyncedChanges`/`markPendingSave`/`FINANCE_PENDING_SAVE_KEY` (:239, :281-301).
- `src/utils/appStateSchema.ts` — `stripDangerousKeys` (:57-70, generic over any `T`, already
  reusable per-shard), the six per-record `normalize*` functions (:146-274), `normalizeAppState`
  composing wrapper (:286-298).
- `ops/research/FF-DATA-2-app_data-scaling.md` §4-5 — the phased recommendation this spec executes
  (Phase 1 gzip + Phase 2 entity split, folded together per the Ticket Index).
- `ARCHITECTURE.md` §6 (Data Model) and §7 (Persistence & Sync Engine) — what must be rewritten
  after this ships (see §8 below).
- `ops/PRODUCT.md` — $0/mo infra cap (no new vendor/dependency needed — native
  `CompressionStream`/`DecompressionStream`), launch order (Web first, Android/iOS later — matters
  for the compat rollout risk in §6).

---

## 1. Target file layout

Per business folder (unchanged parent structure, `googleDrive.ts:230-247`/`ARCHITECTURE.md` §6.3):

```
My Drive/
└── tbiz Data/
    └── <Business Name>/
        ├── manifest.json.gz        ← NEW — the consistency anchor (§3)
        ├── invoices.json.gz        ← NEW shard
        ├── expenses.json.gz        ← NEW shard
        ├── clients.json.gz         ← NEW shard
        ├── bookingAgents.json.gz   ← NEW shard
        ├── app_data.json           ← LEGACY, kept as backup (§4) — never deleted by this ticket
        ├── Invoices/               (unchanged)
        └── Business App Receipts/  (unchanged)
```

Naming uses the literal `.json.gz` suffix (not bare `.json`) so a file is honestly labeled as
gzip-binary if a user ever opens the Drive folder directly — avoids the "looks like JSON, is
actually gibberish" confusion a bare `.json` name would create. Drive's `mimeType` metadata can
stay `application/json` (Drive does not content-negotiate or transcode `alt=media` — it serves and
stores exactly the bytes given, per the existing `createFile`/`fetchAppState` pattern at
`googleDrive.ts:88-136, 252-262`); the app owns compress/decompress entirely at the edges.

**What lives where:**

| File | Contents | Why here |
|---|---|---|
| `manifest.json.gz` | `schemaVersion`, `businessSettings` (incl. `docCounters`), `categories`, `shards` index (per-shard `{fileId, version, recordCount, updatedAt}`), `migration` status block | Everything that's small, changes together, or is needed to *find* the other files before their content is read |
| `invoices.json.gz` | `Invoice[]` | Highest-churn, highest-value-per-byte-saved shard (§2 of FF-DATA-2: ~600-900 B/record) |
| `expenses.json.gz` | `Expense[]` | Second-highest churn (~420-500 B/record) |
| `clients.json.gz` | `Client[]` | Low churn, but separate so a client edit doesn't re-upload invoices/expenses |
| `bookingAgents.json.gz` | `BookingAgent[]` | Smallest, rarest-changing collection; own file mainly for symmetry/consistency with the merge model already partitioned this way (`mergeAppState`, `googleDrive.ts:334-343`) |

`categories` stays inside the manifest (per FF-DATA-2's recommendation) — it's a `string[]` of a
handful of short values, changes rarely, and doesn't justify its own file/round-trip.

**Gzip mechanism:** browser-native `CompressionStream('gzip')` / `DecompressionStream('gzip')`
(Streams API) — zero new dependency, respects the $0/mo cap and adds no build weight. Support:
Chromium ≥80 (covers desktop Chrome/Edge and Android's system WebView, which is Chromium-based —
Capacitor Android target is covered), Safari ≥16.4 / iOS ≥16.4 WKWebView (FinFlow's iOS target
per `ops/PRODUCT.md` is "not yet a full target," so there's no legacy-iOS floor to design around
today, but this is the line to watch when iOS ships). **Fallback:** feature-detect
`typeof CompressionStream !== 'undefined'` at the two call sites; if absent, read/write **plain
uncompressed JSON** for that file (same as today) rather than crash or block. Every read path must
also format-sniff on the way in (try gunzip; on failure, fall back to a plain `JSON.parse` of the
raw bytes) so a file written by a browser without `CompressionStream` support is still readable by
one that has it, and vice versa — this mirrors the exact "not-yet-gzipped legacy file" fallback
FF-DATA-2 flagged for the original single-file gzip phase, just applied per-shard now. If real-world
telemetry later shows a meaningful population without `CompressionStream`, add `pako` as a small
dependency behind the same feature-detect branch — not needed to ship this ticket.

---

## 2. Dirty-tracking + partial save

**Problem being fixed:** today's single effect (`FinanceContext.tsx:598-646`) watches all six
pieces of state as one combined dependency array and, on any change to any of them, calls
`flushToDrive` which uploads the **entire** `AppState` (`googleDrive.ts:289-301`) — no notion of
"which collection actually changed" exists anywhere in the pipeline (confirmed by reading the full
effect body; there is no diffing).

**Design:** keep the single effect and its existing 1-second debounce (do not fragment into six
separate effects/timers — that would need its own cross-shard save-ordering logic for no benefit).
Instead, add **per-collection "last-seen" refs** and compute dirty shards *inside* the effect by
reference comparison:

```
prevExpensesRef, prevInvoicesRef, prevClientsRef, prevBookingAgentsRef,
prevCategoriesRef, prevSettingsRef            // refs, seeded when a load completes
dirtyShardsRef: Set<'invoices'|'expenses'|'clients'|'bookingAgents'|'manifest'>
```

In the effect body (replacing `FinanceContext.tsx:598-646`'s unconditional-dirty logic):

```
if (expenses !== prevExpensesRef.current) { dirtyShardsRef.add('expenses'); prevExpensesRef.current = expenses; }
if (invoices !== prevInvoicesRef.current) { dirtyShardsRef.add('invoices'); prevInvoicesRef.current = invoices; }
if (clients !== prevClientsRef.current) { dirtyShardsRef.add('clients'); prevClientsRef.current = clients; }
if (bookingAgents !== prevBookingAgentsRef.current) { dirtyShardsRef.add('bookingAgents'); prevBookingAgentsRef.current = bookingAgents; }
if (categories !== prevCategoriesRef.current || businessSettings !== prevSettingsRef.current) {
  dirtyShardsRef.add('manifest'); prevCategoriesRef.current = categories; prevSettingsRef.current = businessSettings;
}
```

Because every setter in `FinanceContext` (`addExpense`, `updateInvoice`, etc.) already creates a
**new array/object reference** via spread/map/filter (confirmed by reading every mutator,
`FinanceContext.tsx:717-1038` — none mutate in place), reference inequality is a correct and cheap
dirty signal; no deep-equal needed.

`dirtyShardsRef` **accumulates across the whole debounce window** (a burst of edits to different
collections within the same second all get flushed together, still as separate shard writes, not
lost) and is drained (read + cleared) only when a flush actually starts, so a flush that fails
(network error) leaves the shards it attempted back in the dirty set for the next retry (see §3).

**Important interaction — `docCounters` lives in the manifest:** `businessSettings.docCounters` is
bumped on **every** `addInvoice` call (`FinanceContext.tsx:816-829`), which means the manifest
shard is dirty on essentially every invoice creation, in addition to whichever entity shard changed.
This is expected and still a large net win over today (manifest is tiny — settings + categories +
a shard index, well under 1 KB even gzipped-overhead-included) versus re-uploading the full
multi-hundred-KB `invoices.json`/`expenses.json` every time.

**Where this hooks into the existing save trigger:** the effect's existing debounce
(`setTimeout(..., 1000)`, `FinanceContext.tsx:643`) is unchanged; only what `flushToDrive` does with
the accumulated `dirtyShardsRef` changes (§3). The existing `justLoadedRef` consume-once gate
(`:310-316`, `:624-633`) stays as a single global boolean — a load still adopts all six collections
atomically into memory even when only some shards were actually re-fetched from Drive, so gating the
whole render as load-induced (not per-shard) is correct and simpler.

**Out of scope (explicitly, do not touch in this ticket):** the `localStorage` mirror
(`FinanceContext.tsx:613-619`) stays a full `JSON.stringify` of each collection on every change,
same as today — that's FF-DATA-5's scope per FF-DATA-2's phased plan, not this ticket's.

---

## 3. Per-shard optimistic concurrency

Today's model: one Drive `version` token (`driveVersion.current`, `FinanceContext.tsx:304`) guards
one file; `saveAppStateGuarded` (`googleDrive.ts:372-399`) loops up to 4 attempts, re-fetching and
re-merging the **whole** `AppState` on every conflict.

**New model:** each shard file *and* the manifest carries its **own** Drive `version` token (Drive's
own file-metadata `version` field, read via the existing `getFileVersion` helper,
`googleDrive.ts:307-314` — reused unchanged, just called once per file instead of once total).

```
driveFileIds:  { manifest, invoices, expenses, clients, bookingAgents }   // from the manifest's shard index, cached in refs
driveVersions: { manifest, invoices, expenses, clients, bookingAgents }   // last-seen version per file
```

**New function** `saveShardGuarded(token, fileId, expectedVersion, localCollection, remoteFetchFn, mergeFn)`
— a direct per-shard generalization of today's `saveAppStateGuarded`, same retry shape
(`MAX_ATTEMPTS = 4`, same "persist best-merged result after retries exhausted" fallback,
`googleDrive.ts:396-398`), but scoped to **one array**, reusing the existing generic `mergeById`
helper (`googleDrive.ts:316-322`) directly — it already operates on `T extends {id: string}`, so it
needs zero changes to be called per-shard instead of per-whole-blob.

**Save-cycle ordering (the manifest as consistency anchor):**

1. Snapshot and drain `dirtyShardsRef` (the shards to flush this cycle).
2. For every dirty **entity** shard (invoices/expenses/clients/bookingAgents), run
   `saveShardGuarded` **in parallel** (`Promise.all`) — these collections have no cross-shard
   invariants with each other (the one cross-cutting invariant, gapless document numbering via
   `docCounters`, lives entirely in the manifest, not in the invoices shard, so entity shards are
   safely independent). Collect `{shard: newVersion}` for every shard that succeeded; any shard
   that failed (exhausted its own retries due to a hard error, not a normal conflict-merge) is put
   **back** into `dirtyShardsRef` for the next retry cycle and does **not** block the others.
3. **Only after** every attempted entity-shard write in this cycle has resolved (success or
   failure), write the **manifest last**: fetch the manifest's current version; if it matches the
   locally-held `driveVersions.manifest`, PATCH it with (a) the just-updated shard-index entries for
   whichever shards succeeded in step 2, (b) `businessSettings`/`categories` if `'manifest'` was
   itself in the dirty set. If the manifest's version doesn't match (another device wrote
   meanwhile), fetch the remote manifest and merge: shard-index entries take **the union**, and for
   any shard both devices touched, re-read that shard's **actual current Drive version** via
   `getFileVersion` (Drive is the ground truth for versions, never trust a stale cached number when
   reconciling) before writing the merged index; `businessSettings`/`categories` merge exactly as
   today (`mergeBusinessSettings`'s max-merge for `docCounters`, `googleDrive.ts:345-360`; set-union
   for categories) — both reused unchanged.
4. If the manifest write itself fails, the shards it would have referenced are **already durably
   saved on Drive** (step 2 succeeded for them) — only the manifest's index is stale. Put
   `'manifest'` back into `dirtyShardsRef` and retry the manifest write alone next cycle; this retry
   needs no shard content, only each shard's current `getFileVersion`, so it's cheap and idempotent
   no matter how many times it's retried.

**Why the manifest must be written last:** it is the single source of truth for "which shard file
IDs and versions currently constitute a valid, complete workspace." Writing it before an entity
shard succeeds would let it point at a version that doesn't exist yet (or a stale one), which is
exactly the kind of "referenced-but-not-actually-there" inconsistency the migration's own ordering
(§4) is designed to avoid; keeping the same discipline in the steady-state save path is what makes
the manifest trustworthy for detecting partial-write states.

**"Never lose an unsynced edit" invariant, preserved:** today's durable dirty flag
(`hasUnsyncedChanges`/`FINANCE_PENDING_SAVE_KEY`, `FinanceContext.tsx:239, :281-301`) stays as the
single UI-facing boolean (unchanged public contract — the sync-status pill logic in `AppLayout`
needs no changes). Internally, upgrade what it's backed by: persist the **set** of still-dirty shard
names to localStorage (new key, e.g. `finance_pending_shards`, registered in
`financeCache.ts`'s key registry alongside the existing `finance_*` keys) in addition to the
boolean, so a reload after a crash mid-partial-save knows **exactly** which shards still need
pushing instead of having to treat "everything" as dirty. `hasUnsyncedChanges` is simply `true` iff
that set is non-empty. This is strictly more precise than today's model, not less safe.

---

## 4. The one-time migration (data-safety critical)

Modeled directly on FF-DATA-1's `resolveRootFolderId` precedent (`googleDrive.ts:181-205`):
idempotent, resumable, never destructive, `console.warn` on ambiguity, prefers the new format
without ever touching the old.

**Detection (on every load, before the normal split-file read path):**

| `manifest.json.gz` found? | `app_data.json` found? | Branch |
|---|---|---|
| no | no | Brand-new business — create shards + manifest directly (no legacy file ever created) |
| no | yes | **Run migration** (below) |
| yes, `migration.status === 'complete'` | (irrelevant) | Normal split-file load — legacy file, if still present, is ignored entirely |
| yes, `migration.status === 'in_progress'` | (irrelevant) | **Resume migration** (idempotent re-entry, below) |

Note: unlike FF-DATA-1's folder-rename (where "both exist" was an *error* case requiring manual
reconciliation), **"both manifest and legacy exist" is the expected steady state after a completed
migration** — the legacy file is deliberately kept, not an error signal. The disambiguator is purely
`migration.status`.

**Exact ordering (the data-safety heart — designed so an interruption at any point never corrupts
or loses data):**

1. **Detect.** No manifest found by name; legacy `app_data.json` found. Read and normalize it via
   the existing, unchanged `fetchAppState`/`normalizeAppState` path (`googleDrive.ts:252-262`,
   `appStateSchema.ts:286-298`) — this is the only source of truth until step 5 finalizes.
2. **Claim.** `createFile` a new `manifest.json.gz` with
   `{ schemaVersion: 2, migration: { status: 'in_progress', legacyFileId, startedAt }, shards: {} }`.
   Immediately re-list files named `manifest.json.gz` in this business folder. If **more than one**
   is found (a genuine concurrent-migration race — two devices both detected "no manifest" and both
   created one in the same narrow window), this device lost the race: delete the manifest it just
   created (safe — it references zero shard content anywhere yet) and abort this attempt, falling
   back to a short retry-the-whole-load delay so the winning device's migration is picked up
   normally on the next pass. This closes the "two manifests with the same name, non-deterministic
   which one a later `findFileId` returns" hazard cheaply, at the cost of a rare wasted create+delete
   round-trip — an accepted, documented, low-severity edge case (single-user-per-business is the
   overwhelming common case; true simultaneous first-load-after-ship on two devices is rare).
3. **Write shards, one at a time, in a fixed order** (`invoices` → `expenses` → `clients` →
   `bookingAgents` — arbitrary but fixed, so resumption is deterministic): `createFile` each with the
   gzip-compressed `JSON.stringify` of that collection from the legacy-normalized state. **After
   each individual shard write succeeds**, immediately PATCH the manifest's `shards.<name>` entry
   with `{fileId, version, recordCount, updatedAt}` — so an interruption after shard *N* leaves the
   manifest an accurate, inspectable record of "shards 1..N done, N+1..4 not yet" rather than an
   all-or-nothing black box.
4. **Verify (read-back check).** Once all four shard entries are recorded, re-fetch **every** shard
   file's content (decompress + parse + normalize, same as a normal load) and compare record counts
   (plus a cheap spot-check of first/last ids) against the legacy source's corresponding collection.
   If **any** shard fails this check, **stop** — do not advance `migration.status`. The manifest
   stays `'in_progress'`, which is a safe, resumable state (step 6), and the legacy file has not been
   touched, so no data is at risk from this abort.
5. **Finalize.** Only once every shard verifies clean, PATCH the manifest **one final time**:
   `migration.status = 'complete'`, `migration.migratedAt`, `migration.legacyFileId` (kept for
   reference, never used to derive anything after this point), plus write `businessSettings` and
   `categories` into the manifest body itself (previously the manifest held only migration
   scaffolding). This single PATCH is the commit point — every load from here on takes the
   split-file branch unconditionally.
6. **Preserve the legacy file.** `app_data.json` is **never deleted or overwritten** by this
   migration, matching the ticket's explicit requirement and the FF-DATA-1 precedent
   (`googleDrive.ts:176-179`'s "never merge or delete... data safety over tidiness" comment).
   Optionally — **not required, and recommended as a separate later ticket, not this one's critical
   path** — rename it to `app_data.legacy.json` (a metadata-only `renameFile`, identical mechanism to
   `googleDrive.ts:144-159`) only after `migration.status === 'complete'`, purely to signal "this is
   a backup, not live" without reducing recoverability at all.

**Resumption (interrupted migration, re-entered on a later load):** if `migration.status ===
'in_progress'`, re-run the same function. It reads the manifest's current `shards` index, treats
any shard **already present there with a fileId that still resolves** as done and skips
re-creating it, creates only the missing/invalid ones, then re-runs verification (step 4) and
finalization (step 5). This makes the whole migration idempotent and safe to invoke on every load
until it completes — the same design property `resolveRootFolderId` already has
(`googleDrive.ts:181`: "**idempotent** — the same resolution runs every load; a business past its
first migration takes the `tbizId` branch and does nothing").
Edge case: a manifest shard entry points at a `fileId` that no longer resolves (user manually
deleted it in Drive) — treat as missing and re-create fresh from the still-untouched legacy file
(source of truth until step 5 finalizes).

**Rollback path (explicit, as required):** because the legacy file is never touched before
finalization, rollback is simply: **redeploy the pre-migration build.** That build's `initAppState`
only ever looks for `app_data.json` by exact name (`APP_DATA_FILENAME`, `googleDrive.ts:11, 241`) —
the new `manifest.json.gz`/shard files are invisible to it (different names; Drive's `q` search is
exact-match), so it reads the intact legacy file and works exactly as before. **Known, documented
limitation** (same class of risk FF-DATA-1 already accepted for its rename): if a user made edits
*after* migration completed, under the new split-file format, a rollback to the old build will not
see those edits (they live only in the new shards, and the legacy file is a frozen as-of-migration
snapshot) — this needs manual reconciliation in that specific scenario, exactly like FF-DATA-1's
"both folders exist, reconcile by hand" carve-out. Flag this as an accepted risk for security/qa to
sign off on, not a blocker, since a version-back deploy with zero migration-time data loss is still
achieved for the common case (rollback before/at the point of discovery, not long after).

---

## 5. Schema/version bump

`AppState` (`googleDrive.ts:15-22`) and `appStateSchema.ts` today carry **no version field at
all** — confirmed by reading both files in full; this is the first schema-version FinFlow has had.
This ticket introduces `schemaVersion` **in the manifest**, not in each shard (shards are pure
collections, no envelope needed): `schemaVersion: 2` for the new split-file format, with the
implicit unversioned monolithic-blob format retroactively understood as "version 1."

`appStateSchema.ts` refactor: the existing per-record normalizers already exist as internal
functions (`normalizeExpense`, `normalizeClient`, `normalizeInvoice`, `normalizeBookingAgent`,
`appStateSchema.ts:146-245`) — **export their array-mapping wrappers** as
`normalizeExpenses(raw): Expense[]`, `normalizeClients(raw): Client[]`, `normalizeInvoices(raw):
Invoice[]`, `normalizeBookingAgents(raw): BookingAgent[]` (each simply
`asArray(raw).map(normalizeX).filter(nonNull)`, i.e. exactly the logic already inlined at
`appStateSchema.ts:291-294`, just callable independently). Add `normalizeManifest(raw): {
schemaVersion, businessSettings, categories, shards, migration }` with the same untrusted-input
posture as everything else in this file (F-7 lineage): validate `schemaVersion` is a positive
integer (default 1 if missing/malformed), validate `shards` is an object whose only accepted keys
are the four known shard names, each mapping to `{fileId: string, version: string, recordCount:
number}` (drop anything else defensively — same "degrade, don't crash" posture as the rest of the
file). `stripDangerousKeys` (`:57-70`) is already generic over any `T`, so it applies to manifest
and shard payloads with zero changes.

`normalizeAppState(raw)` **stays exported, unchanged in signature**, now implemented as a thin
composing wrapper over the four collection normalizers + `normalizeManifest`'s
settings/categories fields — so every existing caller that still expects a whole-`AppState` shape
(`mergeAppState`, the legacy-blob load path in the migration itself, the localStorage hydrate
effect at `FinanceContext.tsx:354-361`) keeps working without modification. Each shard's raw content
is normalized through **just its own** collection normalizer when read individually (a partial
fetch of `invoices.json.gz` never needs the whole-blob wrapper).

---

## 6. Backward/forward compat

- **Old build (pre-FF-DATA-4), sees the new files:** invisible to it — it only ever looks up
  `app_data.json` by exact name (`googleDrive.ts:11, 241`). It reads the legacy file and works,
  **as long as nobody has edited under the new format since migration** (see the real gap below).
- **New build, sees only legacy `app_data.json`:** triggers migration (§4).
- **New build, sees manifest with `migration.status === 'in_progress'`:** resumes cleanly (§4).

**The real backward-compat gap, called out plainly:** after migration completes, saves go **only**
to the split shards + manifest — `app_data.json` is a frozen snapshot as of migration time, not
kept live. If an **old build is still in use on any device/platform** after a **new build** has
migrated a business and made further edits, the old build will silently work off stale data and (if
it saves) will write a **conflicting, invisible-to-the-new-format** update to the legacy file —
two sources of truth with no merge path between them. This is a materially higher-stakes version of
the same class of risk FF-DATA-1 accepted for its folder rename, because here **both formats remain
independently writable**, not just one readable-and-stale.

**Recommended mitigation (flag as a DECISION for the orchestrator/owner, not silently assumed):**
ship this in lockstep across platforms per `ops/PRODUCT.md`'s stated launch order (Web first,
Android next, iOS later) so there's no meaningful window where an old build and a migrated business
coexist; and/or have the new build **also** write a full-blob `app_data.json` mirror on every save,
for a fixed grace period post-launch (e.g. a couple of weeks), specifically so a straggling old
build in the field during rollout still sees live data. This dual-write adds back some of the write
cost this ticket exists to eliminate, but only temporarily and only while platform rollout is
incomplete — worth an explicit go/no-go from the owner rather than either silently doing it or
silently skipping it. Given FinFlow is web-only in production today (`ops/PRODUCT.md` — Android/iOS
"not yet a full target"), the near-term exposure is low; this becomes materially more important once
Android/iOS ship as real, independently-updatable targets.

---

## 7. Implementation ticket breakdown, QA live-drill plan, security review points

### 7.1 Sub-tickets for web-developer (ordered; each should land as its own reviewable diff)

1. **FF-DATA-4a — gzip transport helper (folds in FF-DATA-3).** `compressJson`/`decompressJson`
   using `CompressionStream`/`DecompressionStream`, feature-detected with a plain-JSON fallback (§1).
   Format-sniff on read (try gunzip, fall back to plain parse) so mixed compressed/uncompressed
   files across browser versions never break a load.
2. **FF-DATA-4b — `googleDrive.ts`: shard + manifest types and I/O functions.** New
   `Manifest`/`ShardName` types, `fetchManifest`/`saveManifest`, `fetchShard(name)`/`saveShard(name)`
   built on the gzip helper from 4a. **Keep every existing whole-blob function
   (`fetchAppState`/`saveAppState`/`saveAppStateGuarded`) exported and unchanged** — the migration
   (4d) and the rollback path (§4) both depend on them still working exactly as today.
3. **FF-DATA-4c — `appStateSchema.ts`: export per-collection normalizers + `normalizeManifest`.**
   `normalizeAppState` becomes a thin composing wrapper (§5) — verify every existing call site still
   compiles and behaves identically (localStorage hydrate, `mergeAppState`).
4. **FF-DATA-4d — migration function `migrateLegacyToShards()`.** Implements the exact ordering in
   §4 (claim → write shards one-at-a-time with per-shard manifest updates → verify → finalize),
   idempotent/resumable, wired into `initAppState`'s load path as the branch taken when the manifest
   is absent or `in_progress`.
5. **FF-DATA-4e — `FinanceContext.tsx` dirty-tracking + per-shard save.** Per-collection
   `prevRef` snapshots, `dirtyShardsRef` accumulation (§2), `flushToDrive` rewritten to call
   per-shard guarded saves for only the dirty shards + manifest-last ordering (§3), upgraded
   localStorage dirty-shard-set persistence. **Explicitly preserve** every existing invariant already
   documented in the file: logout flush-before-wipe (`:667-715`), reconnect effect (`:653-665`),
   exponential-backoff retry (`:483-489`), `justLoadedRef` consume-once gate (`:310-316`, kept
   global per §2's reasoning).
6. **FF-DATA-4f — dual-write compat decision + implementation (if approved).** Per §6: get an
   explicit go/no-go from the orchestrator/owner on the grace-period dual-write mirror before
   building it; if approved, it's a small addition to 4e's save path (also write the legacy
   `saveAppState` blob), time-boxed and removable.

### 7.2 QA live-drill plan (mirrors FF-DATA-1's style — pre-state, migrate, verify, idempotent
re-run, partial-interruption, rollback; plus the new per-shard save behavior)

1. **Pre-state:** test account (synthetic data only, per board rule) with an existing `app_data.json`
   containing several invoices (incl. one with `paymentLines`, one `Cancelled`), expenses (incl. one
   with full VAT fields), clients, a booking agent, and a populated `docCounters`.
2. **Migrate:** load the app on this branch; confirm manifest + all 4 shard files created,
   `migration.status === 'complete'`, and `app_data.json` **still present, same Drive file ID,
   byte-unmodified**.
3. **Verify integrity + IDs:** every invoice/expense/client/agent id in the shards exactly matches
   the legacy source (counts + spot-checked ids), `docCounters` correctly carried into the manifest,
   categories intact, no duplicates or drops.
4. **Idempotent re-run:** reload / re-trigger the load again — confirm no duplicate shard files, no
   re-migration attempt, manifest unchanged (same fileIds/versions as after step 2).
5. **Partial-interruption:** simulate (manually pre-create the manifest + only 2 of 4 shards in
   Drive, or kill network mid-migration if reproducible), then reload — confirm the migration
   resumes, does not re-create the 2 already-present shards, does not touch the legacy file, and ends
   at `status === 'complete'` with all 4 shards correct.
6. **Concurrent-migration race:** two sessions/devices against the same fresh (pre-migration)
   business at once — confirm no duplicate-manifest corruption (the self-cleanup/abort logic in §4
   step 2 fires), and exactly one manifest survives, referencing a complete/correct shard set.
7. **Rollback:** redeploy (or locally revert to) the pre-migration build against an already-migrated
   business — confirm it reads `app_data.json` correctly and continues to function; explicitly note
   the accepted post-migration-edit-visibility gap from §4/§6 rather than expecting it to be
   magically lossless.
8. **Dirty-save granularity (functional, not migration):** edit a single expense; confirm via Drive
   revision history/`modifiedTime` that **only** `expenses.json.gz` and `manifest.json.gz` changed —
   `invoices.json.gz`/`clients.json.gz`/`bookingAgents.json.gz` must show **no** `modifiedTime`
   change.
9. **Per-shard conflict/merge:** (a) two devices edit *different* shards concurrently — confirm both
   land without loss and the manifest reflects both new versions; (b) two devices edit the *same*
   shard concurrently — confirm the existing merge-by-id, local-wins-on-overlap behavior still
   applies per-shard, matching today's whole-blob guarantee exactly.

### 7.3 Security review points (for security-validator, blocking per the Ticket Index)

- Confirm every new normalizer (`normalizeManifest`, the exported per-collection normalizers)
  applies the same untrusted-input posture as today's `normalizeAppState` (F-7 lineage):
  `stripDangerousKeys`, type coercion, enum whitelisting — and additionally validate
  `shards.<name>.fileId` is a plausible Drive-id-shaped string before it's ever interpolated into a
  `files/{id}` fetch URL (defense against a tampered manifest smuggling an unexpected id; low
  severity given `drive.file` scope already bounds reachable files, but validate the shape anyway).
- Confirm the migration and per-shard save paths introduce **no new Drive OAuth scope** (still
  `drive.file` only, unchanged from `auth.ts`) and **no new public/shared-permission grants** on any
  newly created shard/manifest files (mirrors the F-1 invariant already enforced for PDFs/receipts).
- Confirm decompression has a sanity bound before `JSON.parse` (defense-in-depth against a corrupted
  or maliciously oversized gzip payload exhausting memory on decompress) — low realistic risk for
  this app's own bounded financial-record data (per FF-DATA-2's size projections) but consistent
  with the file's existing "resilient, don't crash" stance.
- Confirm the claim-manifest self-cleanup/abort race-mitigation (§4 step 2) can't be trivially abused
  by a malicious co-editor of a shared Drive folder to keep every device stuck retrying — acceptable
  under the current single-owner-Drive threat model (an account already trusted at `drive.file` level
  is the relevant boundary), but document it as an explicit assumption, not an oversight.
- Confirm no PII/tokens leak into any new `console.warn`/`console.error` added by the migration or
  dirty-tracking code (repo-wide standard; board rule #7).
- Confirm the dual-write mitigation (§6/4f), if approved, doesn't reintroduce any exposure the split
  was meant to reduce (it's a superset write, not a new surface, but call it out explicitly in that
  ticket's own security pass).

---

## 8. `ARCHITECTURE.md` update needed (not made in this session — flagging for whoever owns doc
upkeep after this ships)

- §6.2 "Storage shape" and §6.3 "Google Drive layout" need the new file layout from §1 above
  (manifest + 4 shards + legacy `app_data.json` retained).
- §6.2 needs the new `schemaVersion` concept (§5) — today's doc doesn't mention any schema
  versioning because none existed.
- §7.1 "Load sequence" and §7.2 "Save pipeline" need to describe per-shard dirty-tracking (§2) and
  per-shard optimistic concurrency (§3) replacing the current single-file description.
- §7.3 "Optimistic concurrency + merge" needs the manifest-as-anchor model (§3) in place of the
  single-`version` description.
- §13 "Known Gaps & Roadmap Notes" should note the migration's one open follow-up (optional
  `app_data.json` → `app_data.legacy.json` rename ticket) and the dual-write compat decision (§6) if
  the owner approves it.
