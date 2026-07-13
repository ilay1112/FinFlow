# FF-DATA-4 — Live-Drill Checklist for Owner/QA

**What:** Verify the `app_data.json` entity-split migration works end-to-end on a real Google Drive account.  
**Duration:** ~30–45 minutes for all 9 steps.  
**Prerequisites:**
- A test Google Drive account with NO real business data (use a throw-away or dedicated test account).
- FinFlow running against this branch (FF-DATA-4 implementation, 4a–4e).
- Pre-setup: one business folder with synthetic `app_data.json` containing:
  - 3+ invoices (at least one with `paymentLines`, one `Cancelled`, one normal)
  - 3+ expenses (at least one with full VAT fields: `vat`, `vatRate`, `includesVat`)
  - 2+ clients
  - 1 booking agent
  - Populated `businessSettings.docCounters` (at least one counter > 0)
  - Categories array with 3+ entries

---

## Steps

### 1. Pre-check: Note existing state
- Note the `app_data.json` file ID (Drive Details or URL bar)
- Screenshot or list full contents: count invoices, expenses, clients, agents
- Note first/last invoice ID for integrity check

**Expected result:** baseline recorded.

---

### 2. Migrate: Load app, trigger migration
- Log in with test account
- Select test business in FinFlow
- Wait 2–3 seconds for sync
- Open Drive folder in parallel, watch for new files
- Confirm `manifest.json.gz`, `invoices.json.gz`, `expenses.json.gz`, `clients.json.gz`, `bookingAgents.json.gz` appear
- Confirm **`app_data.json` still present with same file ID** (verify ID matches step 1)

**Expected result:** manifest + 4 shards created; `app_data.json` untouched.

---

### 3. Verify integrity + IDs
- Download each `.json.gz` shard, decompress (locally or via Google Docs)
- Verify record counts match pre-state (step 1):
  - `invoices.json.gz` → N invoices
  - `expenses.json.gz` → M expenses
  - `clients.json.gz` → P clients
  - `bookingAgents.json.gz` → Q agents
- Spot-check first/last ID in each shard against pre-state
- Download manifest, verify:
  - `migration.status: 'complete'`
  - `businessSettings.docCounters` matches
  - `categories` array matches
  - `shards` index has 4 entries with fileId/version/recordCount/updatedAt
- FinFlow UI: navigate Invoices/Expenses/Clients — confirm counts match, no duplicates/drops

**Expected result:** all records migrated correctly, no data loss.

---

### 4. Idempotent re-run
- Reload FinFlow (F5)
- Wait 2–3 seconds
- Watch Drive folder — no new files created, no movement
- Download manifest: fileIds/versions for all 4 shards identical to step 2
- FinFlow UI: data unchanged

**Expected result:** pure no-op; unchanged fileIds/versions.

---

### 5. Partial-interruption resume
- Manually delete one or two shard files from Drive (e.g., `bookingAgents.json.gz`)
- Reload FinFlow
- Confirm missing shard(s) re-created in Drive
- Verify manifest updated with new versions for recreated shards
- Confirm `app_data.json` still present with same file ID
- FinFlow UI: all data complete, no loss

**Expected result:** missing shards recreated, manifest updated, app_data.json untouched.

---

### 6. Concurrent-migration race
- Create second test business folder with fresh `app_data.json`
- Open FinFlow in two tabs simultaneously, both logged in
- In both tabs at the SAME TIME: select the second test business (fresh, no migration yet)
- Watch: one tab will see MigrationRaceLostError in console
- Confirm Drive has exactly ONE `manifest.json.gz` file (no duplicates)
- Reload losing tab: should pick up winner's manifest and proceed

**Expected result:** race self-heals; only one manifest survives; no corruption.

---

### 7. Rollback safety
- Checkout or redeploy pre-FF-DATA-4 build (revert to main)
- Log in with test account
- Confirm app reads `app_data.json` correctly, all data visible
- Edit an expense, save
- Reload: confirms edit persists in legacy file

**KNOWN LIMITATION:** Upgrade back to FF-DATA-4 build → edits from step 7 will NOT be visible (they're in legacy file, not in new shards). This is ACCEPTED per spec §4/§6. Document: "Old-build edits after migration are invisible to new build without manual reconciliation."

**Expected result:** old build works, new build sees legacy data; documented known gap.

---

### 8. Dirty-save granularity
- Reload FF-DATA-4 build
- Edit ONE expense (change amount)
- Wait 2–3 seconds for auto-save
- Check Drive file `modifiedTime`:
  - `expenses.json.gz` → recent timestamp (CHANGED)
  - `manifest.json.gz` → recent timestamp (CHANGED, may sync with expense or docCounter update)
  - `invoices.json.gz` → OLD timestamp (UNCHANGED)
  - `clients.json.gz` → OLD timestamp (UNCHANGED)
  - `bookingAgents.json.gz` → OLD timestamp (UNCHANGED)

**Expected result:** only touched shard(s) + manifest updated; others untouched.

---

### 9. Per-shard conflict/merge

#### Sub-test 9a: Two devices edit DIFFERENT shards
- Two tabs on FF-DATA-4, same business
- Tab 1: edit an invoice
- Tab 2 (same time): edit an expense (different shard)
- Wait 3–5 seconds for both auto-saves
- Confirm both tabs show both edits merged
- Reload a third tab: all edits from both tabs present

**Expected result:** both shard edits land without loss.

#### Sub-test 9b: Two devices edit the SAME shard/record
- Two tabs on FF-DATA-4, same business
- Sync both tabs (reload)
- Tab 1: edit invoice A
- Tab 2 (same time): edit same invoice A
- Wait 3–5 seconds
- Confirm edits merged (local-wins-on-overlap rule applied)
- Reload third tab: merged state durable

**Expected result:** same-shard merges work via merge-by-id; no silent data loss.

---

## Pass/Fail Criteria

**PASS if:**
- All 9 steps complete without data loss or corruption
- Manifest + shards created correctly
- Idempotent re-run is a no-op
- Partial interruption resumes cleanly
- Concurrent race creates only one manifest
- Rollback works (with documented limitation acknowledged)
- Dirty-save only touches the affected shard(s)
- Per-shard merges resolve conflicts correctly

**FAIL if:**
- Any record missing/duplicated
- App crashes
- Manifest/shard files don't exist
- Concurrent race creates duplicate manifests
- Rollback loses data
- Dirty-save uploads non-modified shards
- Merge-by-id fails

---

## Sign-off Template

Post to TEAM_BOARD.md FF-DATA-4 thread after completion:

```
#### [SIGN-OFF] qa-validator → team · <date>
**Ticket:** FF-DATA-4 (live-drill validation)

**QA live-drill result:** PASS (or BLOCK if any failures)

All 9 steps executed against test Google Drive account with synthetic data. 
[Summary: e.g., "Steps 1–9 PASS. Migration created manifest + 4 shards correctly, 
app_data.json untouched, idempotent re-run no-op, partial interruption resumed, 
concurrent race self-healed, rollback works (known limitation documented), 
dirty-save granularity confirmed, per-shard merges correct."]

**Status:** CLEAR
```
