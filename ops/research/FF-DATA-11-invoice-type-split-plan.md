# FF-DATA-11 — Splitting the invoices shard by document type: plan + honest recommendation

**Owner:** backend-platform (design/plan only — no product code changed this session) · **Date:**
2026-07-18 · **Type:** PLAN (verdict + design-if-pursued + phased breakdown, mirroring FF-DATA-2's
report format) · **Gates (if ever implemented):** security + qa, same as FF-DATA-4.

**Grounding (read this session, full files unless noted):**
- `src/services/googleDrive.ts` (full) — shipped FF-DATA-4 shard/manifest I/O: `SHARD_FILENAMES`/
  `SHARD_WRITE_ORDER` (:31-39), `MANIFEST_FILENAME`/`CURRENT_SCHEMA_VERSION` (:30, :40),
  `fetchShard`/`saveShardGuarded` (:312, and the `FinanceContext.tsx` call sites below),
  `mergeManifest` (:445-473), `migrateLegacyToShards` (:632-830 region), `normalizeShardRaw` (:281).
- `src/context/FinanceContext.tsx` (full) — shipped dirty-tracking: `prevInvoicesRef`/
  `dirtyShardsRef` (:363, :368), the reference-equality dirty check (:927), `flushToDrive`
  (:514-752) and its per-shard `saveShardGuarded` calls (:576-591, :1026-1035), the combined save
  effect (:887-967), `allocateInvoiceId`/`DOCUMENT_SEQUENCES` in `src/utils/invoiceMath.ts`
  (:223-294).
- `src/utils/appStateSchema.ts` (full) — `SHARD_NAMES`/`ShardName` (:314-315), `ShardIndexEntry`/
  `Manifest`/`MigrationStatus` (:318-349), `normalizeManifest` (:407+), `isShardName` whitelist
  (:351-353).
- `src/context/FinanceContext.tsx:49` — `DocumentType = 'TaxInvoice' | 'Receipt' |
  'TaxInvoiceReceipt' | 'TransactionInvoice'`; `:177-238` — full `Invoice` interface (fields per
  type: `paymentLines` only on Receipt/TaxInvoiceReceipt per :201-207; `sourceInvoiceId` links a
  settled receipt back to its originating TransactionInvoice).
- `src/utils/invoiceMath.ts:81-94` — `recordsPayment`/`isAccountingDocument`: TaxInvoice and
  TransactionInvoice never carry payment lines; TransactionInvoice is excluded from every turnover/
  VAT/commission calculation (it is a demand doc, not an accounting event).
- `src/pages/InvoicesView.tsx` (read this session) — **one single filtered list over the full
  `invoices` array** (:95 `filteredInvoices`, :147-151 status/type-blind totals, :373-390 type-aware
  badge/action logic) — confirms there is no screen in the app today that only needs one document
  type; every list/dashboard/report consumer already iterates the union of all four types.
- `ops/research/FF-DATA-4-entity-split-spec.md` (full) — the shipped design this plan extends;
  `ops/research/FF-DATA-2-app_data-scaling.md` §2 (full) — the measured per-record sizes and growth
  projections this plan's quantification is built on.
- `TEAM_BOARD.md` Ticket Index (:46-49) — FF-DATA-4 **Done**, shipped 9b8e380, canary just started
  (owner's own account); FF-DATA-8 (manifest-merge hardening follow-up) still **Backlog**; FF-DATA-9
  (stuck-pill race) and FF-DATA-10 (reentrancy guard) both surfaced *after* FF-DATA-4 shipped,
  showing the dirty-tracking/flush pipeline is still shaking out edge cases in production.

---

## 1. Is it worth it? — honest cost/benefit up front

**Verdict: not worth doing now, and not clearly worth doing later either. Recommend closing this as
"not recommended at any foreseeable scale for this app," with a narrow, explicit re-open trigger,
and prioritizing FF-DATA-5 (IndexedDB local mirror) instead.** This is stronger than a plain
"defer" — the quantification below shows the split's benefit stays marginal even under FF-DATA-2's
own 10-year "heavy user" projection, while its costs are real and immediate.

### What splitting actually buys

Invoices are **already** their own shard (FF-DATA-4, shipped) — the win this ticket would add is
*narrower* write amplification: today, editing one receipt re-uploads `invoices.json.gz` in full
(all TaxInvoice/Receipt/TaxInvoiceReceipt/TransactionInvoice records mixed together); after a
type-split, it would re-upload only `receipts.json.gz`. That is the *entire* marginal benefit —
splitting does not reduce total stored bytes, does not reduce load-time bytes (see below), and does
not touch CPU/normalize cost per record (same total record count either way).

### Quantified (computed, not guessed)

Built synthetic `Invoice` records shaped exactly like `src/context/FinanceContext.tsx:177-238`
(varied Hebrew client names/descriptions/dates/amounts per record, not identical repeated text, so
the gzip ratio is realistic rather than artificially over-compressed) and ran them through
`JSON.stringify`/`zlib.gzipSync`, for an 800-document corpus split 40% TaxInvoice / 25% Receipt /
20% TaxInvoiceReceipt / 15% TransactionInvoice (a plausible mix — no real per-type usage telemetry
exists yet, flagged as an assumption, not measured data):

| Shard | Records | Raw | Gzipped |
|---|---|---|---|
| TaxInvoice | 320 | 136.8 KB | 12.9 KB |
| Receipt | 200 | 98.9 KB | 9.7 KB |
| TaxInvoiceReceipt | 160 | 80.7 KB | 8.3 KB |
| TransactionInvoice | 120 | 52.1 KB | 5.4 KB |
| **Whole `invoices.json.gz` (today, FF-DATA-4)** | **800** | **368.6 KB** | **33.6 KB** |

800 documents corresponds to FF-DATA-2's own "~2.5–3 years, active Osek Murshe" milestone (§2 of
that report). Two findings fall out of this directly:

1. **The whole shard is already tiny.** 33.6 KB gzipped for ~3 years of activity is not a
   perceptible load-time cost on any real connection — nowhere near Drive's 5 MB media-upload
   cliff (`FF-DATA-2-app_data-scaling.md` §2) or a meaningful fraction of a page load. Scaling
   linearly to FF-DATA-2's own "~10+ years, rare" milestone (4000 invoices) puts the whole shard at
   only **~168 KB gzipped** — still a non-issue.
2. **Splitting loses shared-dictionary compression.** Gzipping the same 800 records as 4 separate
   files instead of 1 combined file measured **36.3 KB total vs. 33.6 KB combined — a real, measured
   +8.1% overhead** from losing cross-record dictionary reuse across type boundaries (client names,
   field names, and repeated structural text compress better together than apart). This is a small
   but *negative* and directly quantifiable side effect of the split, not a benefit.

**The actual write-amplification saving** (editing one receipt): today, ~33.6 KB re-uploaded;
after the split, ~9.7 KB re-uploaded (just `receipts.json.gz`) — a saving of **~24 KB per edit** at
this corpus size. That is the whole payoff. It is real but tiny in absolute terms — well under any
threshold a user could perceive as faster, and dwarfed by what FF-DATA-4 already won (going from a
single ~1 MB/~181 KB-gzipped whole-`app_data.json` blob down to a ~34 KB-gzipped invoices shard in
the first place, per FF-DATA-2 §2). Splitting further is optimizing an already-solved problem by a
small additional margin.

### What it costs

- **Every real consumer of `invoices` needs the union of all four types, always.** Confirmed by
  reading `src/pages/InvoicesView.tsx` (single filtered list, no type-siloed screen), `vatReport.ts`
  (:282, :329, :411 all iterate the full array filtering by `isAccountingDocument`/`documentType`),
  and `invoiceMath.ts:200-213` (`computeYtdTurnover` — full-array filter). There is **no view in the
  app today that only needs one document type** — the split only pays off on the *write* path, and
  costs on the *read* path: every cold load and every business switch goes from 1 shard fetch to 4
  parallel fetches, 4 manifest shard-index entries instead of 1, and more Drive API request-rate
  quota consumption per load (`FF-DATA-2-app_data-scaling.md` §2's "Google Drive practical limits"
  point — more sequential/parallel calls per load, even if parallelized, is still more calls).
- **Dirty-tracking gets structurally harder, not just bigger.** FF-DATA-4's dirty-tracking (
  `FinanceContext.tsx:927`) works because it's a **cheap reference-equality check on one array**:
  `if (invoices !== prevInvoicesRef.current)`. A type-split needs to know **which type(s)** changed
  inside that one array — reference equality on the whole array tells you nothing about which
  record(s) moved. This requires either (a) an actual diff of old vs. new array by id+type on every
  edit (real CPU cost per edit, undermining the "cheap ref comparison" property the whole
  dirty-tracking design relies on), or (b) threading explicit per-type dirty-marking into every
  invoice mutator call site (`addInvoice`, `updateInvoice`, delete/cancel, the "create receipt from
  TransactionInvoice" flow) — more call sites that must all stay correct, on a collection that
  already has two production bugs surfaced in its dirty-tracking/flush pipeline post-launch
  (FF-DATA-9's stuck-pill race, FF-DATA-10's reentrancy gap — both in `TEAM_BOARD.md:47-52`).
- **A document whose type changes must move shards — the scariest correctness risk here.** Editing
  a Draft TaxInvoice into a TaxInvoiceReceipt (or any type change) means the record must be
  **removed from one type's shard and added to another's in the same save cycle** — a single edit
  now touches 2 files instead of 1, and a bug in detecting "the type changed" risks the record being
  duplicated across both shards or silently dropped from both. This is a financial-record integrity
  risk introduced *by* the split, with no equivalent today (today the record just stays in the one
  `invoices.json.gz` regardless of type).
- **A second real-user migration, soon after the first.** FF-DATA-4 shipped 2026-07-14 and its
  canary (owner's own account) only just started (`TEAM_BOARD.md:46`); FF-DATA-8 (a manifest-merge
  hardening follow-up from FF-DATA-4's own security re-review) is still in the backlog. Running a
  second shard-migration (`invoices.json.gz` → 4 files) against production Drive data before the
  first migration has fully proven out compounds risk for a marginal (~24 KB/edit) payoff.

### Compared to FF-DATA-5 (IndexedDB local mirror) — the already-planned next phase

FF-DATA-5 (per `FF-DATA-2-app_data-scaling.md` §5, Phase 3) replaces the six full-`JSON.stringify`
`localStorage.setItem` calls (`FinanceContext.tsx:613-619` in the FF-DATA-2-era line numbers; the
mechanism is unchanged post-FF-DATA-4) that run **synchronously on the main thread on every single
edit**, not on a debounce. This is a cost every user already pays today, that **grows with the same
data curve** as this ticket's target, and is felt on every keystroke-adjacent edit rather than only
on the (already off-critical-path, 1-second-debounced, async) Drive flush. FF-DATA-5 is a strictly
higher-leverage next investment than a second invoices split: it fixes a cost users feel now,
whereas FF-DATA-11's benefit is a Drive-upload byte count nobody can perceive at today's or even
FF-DATA-2's projected 10-year data volumes.

### The verdict, plainly

- **Do now: no.** The whole shard this ticket would split is ~34 KB gzipped today; splitting saves
  ~24 KB per receipt/tax-invoice-receipt edit and *costs* read fan-out on every load plus real
  correctness risk (type-change-moves-shards) for financial records.
- **Defer with a trigger:** only reconsider if **`invoices.json.gz` gzipped exceeds ~300 KB**
  (≈7,000+ mixed-type documents by this report's per-record measurements — beyond FF-DATA-2's own
  "10+ years, rare" milestone) **and** real per-type edit-frequency telemetry (which does not exist
  today) shows edits concentrate heavily in types whose shard would be meaningfully smaller than the
  whole. Absent both conditions, this stays closed.
- **Do first instead:** FF-DATA-5 (IndexedDB local mirror) — bigger, sooner-felt, user-visible win
  for the same underlying "growing data" concern.

---

## 2. Design if ever pursued (speculative — not recommended near-term per §1)

Written to the same standard of detail as FF-DATA-4's spec, so it can be picked up directly if the
§1 trigger is ever met. Reuses almost all FF-DATA-4 machinery.

### 2.1 File layout

```
My Drive/
└── tbiz Data/
    └── <Business Name>/
        ├── manifest.json.gz            ← schemaVersion bumped to 3
        ├── tax-invoices.json.gz        ← NEW, replaces invoices.json.gz's TaxInvoice records
        ├── receipts.json.gz            ← NEW
        ├── tax-invoice-receipts.json.gz← NEW
        ├── transaction-invoices.json.gz← NEW
        ├── expenses.json.gz            ← unchanged (FF-DATA-4)
        ├── clients.json.gz             ← unchanged
        ├── bookingAgents.json.gz       ← unchanged
        ├── invoices.json.gz            ← LEGACY (post-FF-DATA-4 combined shard), kept as backup
        ├── app_data.json               ← LEGACY (pre-FF-DATA-4), still kept, never touched
        ├── Invoices/                   (unchanged)
        └── Business App Receipts/      (unchanged)
```

`ShardName` (`appStateSchema.ts:315`) extends from `'invoices' | 'expenses' | 'clients' |
'bookingAgents'` to `'taxInvoices' | 'receipts' | 'taxInvoiceReceipts' | 'transactionInvoices' |
'expenses' | 'clients' | 'bookingAgents'` — `SHARD_NAMES` (`:314`) and the `isShardName` whitelist
(`:351-353`) both need the new entries; `'invoices'` stays a *recognized legacy* key in the manifest
type only for reading an unmigrated business's shard index during the transition, never written by
a new build.

### 2.2 In-memory model — one array, routed on save

**Keep exactly one `invoices: Invoice[]` state array in `FinanceContext`** — every existing
consumer (`InvoicesView.tsx`, `vatReport.ts`, `invoiceMath.ts`'s turnover/commission functions,
the dashboard) keeps working unmodified, since none of them need to know the storage split exists.
The split is purely a persistence-layer concern:

- **Load:** fetch all 4 type shards in parallel (`Promise.all`, same pattern as FF-DATA-4's cold-
  load), concat into one `invoices` array. Order doesn't matter — every consumer already sorts by
  `date`/`createdAt` at render time (`InvoicesView.tsx`), not by storage order.
- **Save:** route each `Invoice` record to its shard by `record.documentType` (defaulting via the
  same `DEFAULT_DOCUMENT_TYPE = 'TaxInvoice'` fallback already used for numbering,
  `invoiceMath.ts:233`, for legacy/undefined-type records) when building each type-file's array to
  write.

### 2.3 Per-type dirty-tracking within the invoice collection

Cannot reuse FF-DATA-4's reference-equality check (`FinanceContext.tsx:927`) as-is, because it only
tells you the whole `invoices` array changed, not which type(s). Two viable approaches, in order of
preference:

1. **Tag dirty type(s) at the mutator, not the effect.** Every invoice-mutating function
   (`addInvoice`, `updateInvoice`, delete/cancel, the "create receipt from TransactionInvoice" flow)
   already knows the record(s) it just touched and their `documentType`(s) — have each mutator push
   the affected type(s) directly into a `dirtyInvoiceTypesRef` set (parallel to today's
   `dirtyShardsRef`) at the point of mutation, instead of inferring it later from an array diff.
   This preserves the "cheap, no full-array diff" property FF-DATA-4 relies on, at the cost of
   touching every invoice-mutating call site (more surface, but each site is small and reviewable).
2. **Diff old vs. new array by `id` on the debounced flush.** Simpler to wire (one place, not N
   mutator call sites) but reintroduces a real per-flush cost (`O(n)` over the whole invoices array
   on every flush) that FF-DATA-4's design specifically avoided — not recommended unless (1) proves
   too invasive across the mutator surface.

Either way, `dirtyShardsRef`'s `'invoices'` entry is replaced by up to 4 possible entries
(`'taxInvoices' | 'receipts' | 'taxInvoiceReceipts' | 'transactionInvoices'`), following the same
accumulate-across-debounce-window / drain-on-flush-start discipline already in place
(`FinanceContext.tsx:526-527`).

### 2.4 The type-change-moves-shards edge case (must be explicit, not incidental)

When `updateInvoice` changes a record's `documentType` (e.g. Draft TaxInvoice → TaxInvoiceReceipt,
or via the "create receipt from TransactionInvoice" flow), the record must be **removed from the
old type's array and added to the new type's array** in the same save cycle — mark **both** the old
and new type dirty. This requires the mutator to know the record's *previous* `documentType` at the
moment of the edit (available — `updateInvoice` receives the prior array) and must never be
inferred implicitly from "the record is present in the new type's shard" (a partial/interrupted
save could leave it present in neither, or both, transiently — the save/manifest-anchor ordering
from FF-DATA-4 §3 needs to treat this as a 2-shard atomic unit per record, which the existing
`Promise.all`-parallel-entity-shard-write model does **not** currently guarantee ordering between).

### 2.5 Load path

Parallel `Promise.all([fetchShard('taxInvoices'), fetchShard('receipts'),
fetchShard('taxInvoiceReceipts'), fetchShard('transactionInvoices')])`, each normalized through its
own array normalizer (all four reuse the **same** `normalizeInvoices`/`normalizeInvoice` logic
already exported, `appStateSchema.ts:296-302` per the FF-DATA-4 pattern — no new normalizer needed,
just called 4 times instead of once), concatenated into the single `invoices` array before
`setInvoices`.

### 2.6 Migration (`invoices.json.gz` → 4 type files) — same discipline as FF-DATA-4 §4

1. Detect: manifest's `schemaVersion < 3` (or `shards.invoices` present, the 4 new type keys absent)
   triggers migration; `invoices.json.gz` (FF-DATA-4's shard) is the source of truth until finalized.
2. Claim: bump `migration.status = 'in_progress'` with a distinct sub-phase marker (this migration
   runs *after* FF-DATA-4's own migration is already `'complete'` — never conflate the two).
3. Read `invoices.json.gz`, partition by `documentType` in memory, write the 4 new type files **one
   at a time in a fixed order**, PATCHing the manifest's shard index after each succeeds (identical
   ordering discipline to FF-DATA-4 §4 step 3).
4. Verify: re-fetch all 4 new files, compare total record count and per-type counts against the
   source `invoices.json.gz`; spot-check ids. Abort (stay `in_progress`) on any mismatch.
5. Finalize: `schemaVersion = 3`, mark migration complete only once all 4 verify clean.
6. **Never delete or overwrite `invoices.json.gz`** (kept as backup, same as `app_data.json` is kept
   after FF-DATA-4) — rollback to a pre-FF-DATA-11 build reads it unchanged.
7. Resumable/idempotent exactly per FF-DATA-4 §4's re-entry logic (skip already-present/valid type
   shards on a re-run).

### 2.7 Empty types

A business that has never issued a TransactionInvoice still needs `transaction-invoices.json.gz`
created (empty array) at migration/first-save time and fetched on every load — small but real
per-load overhead (4 GETs regardless of how many types are actually in use).

---

## 3. Phased implementation plan (if ever recommended — ordered sub-tickets)

Not tickable until the §1 trigger is met. Listed here so it doesn't need re-deriving later.

1. **FF-DATA-11a** — `appStateSchema.ts`: extend `SHARD_NAMES`/`ShardName`/`isShardName` with the 4
   new type-shard names; `Manifest.shards` index grows accordingly; `normalizeManifest` validates
   the new keys with the same untrusted-input posture (F-7 lineage) as today.
2. **FF-DATA-11b** — `googleDrive.ts`: `SHARD_FILENAMES` gains the 4 new file names;
   `fetchShard`/`saveShardGuarded` already operate generically per `ShardName` (`googleDrive.ts:312`
   region) — confirm they need **zero logic changes**, only new `ShardName` values flowing through.
3. **FF-DATA-11c** — `FinanceContext.tsx`: per-type dirty-tracking at the mutator call sites (§2.3
   approach 1), explicit type-change-moves-shards handling (§2.4) in `updateInvoice` and the
   create-receipt-from-TransactionInvoice flow, load-path parallel-fetch-and-concat (§2.5).
4. **FF-DATA-11d** — migration function `migrateInvoicesToTypeShards()` (§2.6), wired into the load
   path as the branch taken when `schemaVersion < 3`.
5. **FF-DATA-11e** — regression pass confirming every existing consumer
   (`InvoicesView.tsx`, `vatReport.ts`, `invoiceMath.ts` turnover/commission math, PDF template) is
   byte-identical in behavior, since the in-memory `invoices` array shape is unchanged.

**Gates:** security + qa, same as FF-DATA-4 (blocking) — this ticket's security review should
explicitly re-examine the type-change-moves-shards path (§2.4) as its own finding, not fold it into
a generic "looks like FF-DATA-4" sign-off.

**Owner live-drill outline** (mirrors `ops/research/FF-DATA-4-LIVE-DRILL-CHECKLIST.md`'s style, not
re-derived in full here since it's not being ticketed): pre-state with a mix of all 4 document
types incl. one that changed type after creation → migrate → verify per-type counts/ids match the
source `invoices.json.gz` → idempotent re-run → partial-interruption resume → **type-change-moves-
shards case specifically** (edit a record's type post-migration, confirm it lands in exactly one
new shard, never both/neither) → rollback to pre-FF-DATA-11 build reads `invoices.json.gz` correctly.

---

## 4. Risks (summary — detailed inline in §1/§2 above)

- **Compounding a second real-user migration** onto a still-fresh FF-DATA-4 canary/rollback window,
  for a marginal (~24 KB/edit) payoff.
- **Type-change-moves-shards** — the one genuine new correctness risk this split introduces onto
  financial records that didn't exist before (a record can't currently "not have" a shard).
- **Load fan-out with no compensating read-side win** — confirmed no screen queries a single
  document type in isolation; every load pays 4 fetches for a benefit that only exists on writes.
- **Dirty-tracking complexity growth** on a pipeline that has already produced two production bugs
  post-FF-DATA-4 (FF-DATA-9, FF-DATA-10) — adding more per-type surface area increases exposure to
  the same class of race/reentrancy issue.
- **Measured gzip-dictionary loss (+8.1%)** from splitting one shard into 4 — a real, quantified,
  if small, regression with no offsetting benefit on the read path.
