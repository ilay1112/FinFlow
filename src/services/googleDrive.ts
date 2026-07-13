import type { Expense, Client, Invoice, BusinessSettings, BookingAgent } from '../context/FinanceContext';
import {
  normalizeAppState,
  normalizeInvoices,
  normalizeExpenses,
  normalizeClients,
  normalizeBookingAgents,
  normalizeManifest,
} from '../utils/appStateSchema';
import type { ShardName, Manifest } from '../utils/appStateSchema';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_CATEGORIES } from '../config/defaults';
import { compressJson, decompressJson } from '../utils/gzipTransport';

export type { ShardName, Manifest, ShardIndexEntry } from '../utils/appStateSchema';

const ROOT_FOLDER_NAME = 'tbiz Data';
// FF-DATA-1 — pre-rebrand folder name. Existing users' Drive data still lives
// under this name; resolveRootFolderId() migrates it to ROOT_FOLDER_NAME (a
// metadata-only rename, id/children preserved) the first time they load after
// the rebrand. Never remove this without confirming no live folder still uses it.
const LEGACY_ROOT_FOLDER_NAME = 'FinFlow Data';
const APP_DATA_FILENAME = 'app_data.json';
const RECEIPTS_FOLDER_NAME = 'Business App Receipts';
const INVOICES_FOLDER_NAME = 'Invoices';

// FF-DATA-4 — entity-split file layout (spec §1). `.json.gz` is used even when a
// browser falls back to plain-JSON content (gzip unsupported) so a file is never
// mislabeled; the gzip transport helper (utils/gzipTransport.ts) format-sniffs on
// read regardless of the name.
const MANIFEST_FILENAME = 'manifest.json.gz';
const SHARD_FILENAMES: Record<ShardName, string> = {
  invoices: 'invoices.json.gz',
  expenses: 'expenses.json.gz',
  clients: 'clients.json.gz',
  bookingAgents: 'bookingAgents.json.gz',
};
// Fixed shard-write order for the migration (§4) — arbitrary but fixed, so a
// resumed/interrupted migration is deterministic about what's done vs. pending.
const SHARD_WRITE_ORDER: readonly ShardName[] = ['invoices', 'expenses', 'clients', 'bookingAgents'];
const CURRENT_SCHEMA_VERSION = 2;

/** Thrown internally when this device loses a concurrent-migration-claim race (§4 step 2). */
export class MigrationRaceLostError extends Error {
  constructor() {
    super('FF-DATA-4d: lost a concurrent migration-claim race; deferring to the winning device.');
    this.name = 'MigrationRaceLostError';
  }
}

export interface AppState {
  expenses: Expense[];
  clients: Client[];
  invoices: Invoice[];
  categories: string[];
  bookingAgents?: BookingAgent[];
  businessSettings: BusinessSettings;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

interface DriveListResponse {
  files: DriveFile[];
}

export interface BusinessFolder {
  id: string;
  name: string;
}

const DEFAULT_STATE: AppState = {
  expenses: [],
  clients: [],
  invoices: [],
  categories: [...DEFAULT_CATEGORIES],
  bookingAgents: [],
  businessSettings: { ...DEFAULT_BUSINESS_SETTINGS },
};

/**
 * F-6 — Escapes a user-controlled value before it is interpolated into a Drive `q`
 * string literal (`name = '...'`). Drive's query language uses single-quoted string
 * literals with backslash escaping, so an unescaped quote in a business/vendor name
 * (e.g. `O'Brien`, or a crafted `' or '1'='1`) would break or broaden the query.
 * Backslashes are escaped first, then single quotes; control chars (incl. the CR/LF
 * that could smuggle extra clauses) are stripped. Every `q` that embeds a name MUST
 * route its value through this helper.
 */
export function escapeDriveQueryValue(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

/**
 * Searches for a file by name. Returns the file ID or null.
 */
async function findFileId(token: string, name: string, isFolder: boolean = false, parentId: string = 'root'): Promise<string | null> {
  const q = `name = '${escapeDriveQueryValue(name)}' and trashed = false and '${parentId}' in parents${isFolder ? " and mimeType = 'application/vnd.google-apps.folder'" : ""}`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Drive API List Error:', response.status, errorData);
    throw new Error(`Drive API Error: ${response.status} ${errorData.error?.message || ''}`);
  }

  const data: DriveListResponse = await response.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * FF-DATA-4d — like `findFileId`, but returns EVERY matching file id instead of
 * just the first. Used solely by the migration's concurrent-claim race check
 * (§4 step 2): after this device creates `manifest.json.gz`, it re-lists by exact
 * name to detect whether another device's migration created one in the same
 * narrow window.
 */
async function listFileIdsByName(token: string, name: string, parentId: string): Promise<string[]> {
  const q = `name = '${escapeDriveQueryValue(name)}' and trashed = false and '${parentId}' in parents`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Drive API List Error:', response.status, errorData);
    throw new Error(`Drive API Error: ${response.status} ${errorData.error?.message || ''}`);
  }

  const data: DriveListResponse = await response.json();
  return (data.files || []).map((f) => f.id);
}

/**
 * Creates a JSON file or Folder.
 */
async function createFile(token: string, name: string, content: AppState | null = null, isFolder: boolean = false, parentId: string | null = null): Promise<string> {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: isFolder ? 'application/vnd.google-apps.folder' : 'application/json',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  if (isFolder || !content) {
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Drive API Create Error:', response.status, errorData);
      throw new Error(`Drive API Create Failed: ${response.status} ${errorData.error?.message || ''}`);
    }

    const data: DriveFile = await response.json();
    return data.id;
  }

  // Create file with content (Simple upload)
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Drive API Upload Error:', response.status, errorData);
    throw new Error(`Drive API Upload Failed: ${response.status} ${errorData.error?.message || ''}`);
  }

  const data: DriveFile = await response.json();
  return data.id;
}

/**
 * FF-DATA-4b — creates a new gzip-compressed shard/manifest file (via the FF-DATA-4a
 * transport helper) and returns both its Drive file id AND its initial `version`
 * token in one round-trip (`fields=id,version`), so the migration (4d) and the
 * fresh-business bootstrap never need a separate `getFileVersion` call right after
 * creating a file.
 */
async function createGzipFile(
  token: string,
  name: string,
  content: unknown,
  parentId: string
): Promise<{ id: string; version: string }> {
  const metadata = { name, mimeType: 'application/json', parents: [parentId] };
  const blob = await compressJson(content);

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Drive API Upload Error:', response.status, errorData);
    throw new Error(`Drive API Upload Failed: ${response.status} ${errorData.error?.message || ''}`);
  }

  const data = (await response.json()) as { id: string; version?: string };
  return { id: data.id, version: data.version || '' };
}

/**
 * FF-DATA-4b — overwrites an existing shard/manifest file's content with a fresh
 * gzip-compressed body. Mirrors `saveAppState`'s shape (PATCH, `fields=version`)
 * but sends compressed bytes instead of a raw JSON string.
 */
async function patchGzipContent(token: string, fileId: string, content: unknown): Promise<string> {
  const blob = await compressJson(content);
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=version`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: blob,
    }
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Drive API Save Error:', response.status, errorData);
    throw new Error(`Drive API Save Failed: ${response.status} ${errorData.error?.message || ''}`);
  }
  const result = await response.json().catch(() => ({}));
  return (result.version as string) || '';
}

/**
 * FF-DATA-4b — downloads a shard/manifest file's raw bytes and decompresses/parses
 * them via the FF-DATA-4a transport helper (format-sniffed: gzip or plain JSON).
 * Returns the untrusted, still-unnormalized parsed value; every caller normalizes
 * it through the appropriate `appStateSchema.ts` function before use (F-7 posture).
 */
async function downloadAndDecompress(token: string, fileId: string): Promise<unknown> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to download shard/manifest file');
  const blob = await response.blob();
  return decompressJson(blob);
}

/** True if a Drive file id still resolves to an existing file (used by the migration's
 * resume path — a manifest shard entry may point at an id the user deleted by hand). */
async function fileStillResolves(token: string, fileId: string): Promise<boolean> {
  try {
    await getFileVersion(token, fileId);
    return true;
  } catch {
    return false;
  }
}

function normalizeShardRaw(name: ShardName, raw: unknown): (Invoice | Expense | Client | BookingAgent)[] {
  switch (name) {
    case 'invoices':
      return normalizeInvoices(raw);
    case 'expenses':
      return normalizeExpenses(raw);
    case 'clients':
      return normalizeClients(raw);
    case 'bookingAgents':
      return normalizeBookingAgents(raw);
  }
}

/** Read-back verification (§4 step 4): counts + a cheap first/last-id spot-check
 * against the legacy source's corresponding collection. */
function shardMatchesLegacy(readBack: { id: string }[], expected: { id: string }[]): boolean {
  if (readBack.length !== expected.length) return false;
  if (readBack.length === 0) return true;
  return (
    readBack[0].id === expected[0].id &&
    readBack[readBack.length - 1].id === expected[expected.length - 1].id
  );
}

/**
 * FF-DATA-4b — fetches and normalizes a single shard file's collection.
 */
export async function fetchShard(token: string, fileId: string, name: 'invoices'): Promise<Invoice[]>;
export async function fetchShard(token: string, fileId: string, name: 'expenses'): Promise<Expense[]>;
export async function fetchShard(token: string, fileId: string, name: 'clients'): Promise<Client[]>;
export async function fetchShard(token: string, fileId: string, name: 'bookingAgents'): Promise<BookingAgent[]>;
export async function fetchShard(token: string, fileId: string, name: ShardName): Promise<unknown[]> {
  const raw = await downloadAndDecompress(token, fileId).catch(() => []);
  return normalizeShardRaw(name, raw);
}

/**
 * FF-DATA-4b — overwrites a shard file's content. Returns the new Drive `version`.
 */
export async function saveShard(token: string, fileId: string, data: unknown[]): Promise<string> {
  return patchGzipContent(token, fileId, data);
}

/**
 * FF-DATA-4b — fetches and normalizes the manifest.
 */
export async function fetchManifest(token: string, fileId: string): Promise<Manifest> {
  const raw = await downloadAndDecompress(token, fileId).catch(() => ({}));
  return normalizeManifest(raw);
}

/**
 * FF-DATA-4b — overwrites the manifest's content. Returns the new Drive `version`.
 */
export async function saveManifest(token: string, fileId: string, manifest: Manifest): Promise<string> {
  return patchGzipContent(token, fileId, manifest);
}

/**
 * FF-DATA-4/§3 — per-shard generalization of `saveAppStateGuarded` below: same
 * retry shape (MAX_ATTEMPTS = 4, persist-best-merged-result-after-retries-exhausted
 * fallback), scoped to ONE shard's collection, reusing `mergeById` directly (it
 * already operates on `T extends {id: string}`, so it needs zero changes to run
 * per-shard instead of per-whole-blob).
 */
export async function saveShardGuarded(
  token: string,
  fileId: string,
  expectedVersion: string | null,
  localCollection: Invoice[],
  name: 'invoices'
): Promise<{ version: string; merged: Invoice[] | null }>;
export async function saveShardGuarded(
  token: string,
  fileId: string,
  expectedVersion: string | null,
  localCollection: Expense[],
  name: 'expenses'
): Promise<{ version: string; merged: Expense[] | null }>;
export async function saveShardGuarded(
  token: string,
  fileId: string,
  expectedVersion: string | null,
  localCollection: Client[],
  name: 'clients'
): Promise<{ version: string; merged: Client[] | null }>;
export async function saveShardGuarded(
  token: string,
  fileId: string,
  expectedVersion: string | null,
  localCollection: BookingAgent[],
  name: 'bookingAgents'
): Promise<{ version: string; merged: BookingAgent[] | null }>;
export async function saveShardGuarded(
  token: string,
  fileId: string,
  expectedVersion: string | null,
  localCollection: { id: string }[],
  name: ShardName
): Promise<{ version: string; merged: { id: string }[] | null }> {
  let expected = expectedVersion;
  let dataToSave = localCollection;
  let didMerge = false;
  const MAX_ATTEMPTS = 4;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await getFileVersion(token, fileId);
    if (current === expected) {
      const version = await patchGzipContent(token, fileId, dataToSave);
      return { version, merged: didMerge ? dataToSave : null };
    }
    // Conflict: another device wrote this shard since we loaded. Fetch + normalize
    // the remote copy, merge by id (local wins on overlap), and retry.
    const remoteRaw = await downloadAndDecompress(token, fileId).catch(() => []);
    const remote = normalizeShardRaw(name, remoteRaw);
    dataToSave = mergeById(dataToSave, remote);
    expected = current;
    didMerge = true;
  }

  // Exhausted retries (rapid concurrent writers) — persist the best merged result.
  const version = await patchGzipContent(token, fileId, dataToSave);
  return { version, merged: dataToSave };
}

/**
 * FF-DATA-4/§3 — the manifest's own guarded save. The manifest is always written
 * LAST in a save cycle (after every attempted entity-shard write this cycle has
 * resolved) so it never points at a shard version that doesn't actually exist yet.
 * On a version conflict, shard-index entries are unioned; for any shard BOTH
 * devices touched, this re-reads that shard's actual current Drive version via
 * `getFileVersion` (never trusting a stale cached number) before writing the
 * merged index. `businessSettings`/`categories` merge exactly as the whole-blob
 * path already does (`mergeBusinessSettings`'s max-merge for `docCounters`,
 * set-union for categories) — both reused unchanged below.
 */
export async function saveManifestGuarded(
  token: string,
  fileId: string,
  expectedVersion: string | null,
  localManifest: Manifest
): Promise<{ version: string; merged: Manifest | null }> {
  let expected = expectedVersion;
  let manifestToSave = localManifest;
  let didMerge = false;
  const MAX_ATTEMPTS = 4;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await getFileVersion(token, fileId);
    if (current === expected) {
      const version = await patchGzipContent(token, fileId, manifestToSave);
      return { version, merged: didMerge ? manifestToSave : null };
    }
    const remote = await fetchManifest(token, fileId);
    manifestToSave = await mergeManifest(token, manifestToSave, remote);
    expected = current;
    didMerge = true;
  }

  const version = await patchGzipContent(token, fileId, manifestToSave);
  return { version, merged: manifestToSave };
}

async function mergeManifest(token: string, local: Manifest, remote: Manifest): Promise<Manifest> {
  const shardNames = new Set<ShardName>([
    ...(Object.keys(local.shards || {}) as ShardName[]),
    ...(Object.keys(remote.shards || {}) as ShardName[]),
  ]);
  const mergedShards: Manifest['shards'] = {};
  for (const name of shardNames) {
    const l = local.shards[name];
    const r = remote.shards[name];
    if (l && r && l.fileId === r.fileId) {
      // Both devices touched this shard — re-read its ACTUAL current Drive version
      // rather than trusting either cached copy (Drive is the ground truth here).
      const version = await getFileVersion(token, l.fileId).catch(() => r.version || l.version);
      mergedShards[name] = { ...l, version, updatedAt: new Date().toISOString() };
    } else if (l && r) {
      // Different fileIds for the same shard name should not normally happen (a
      // shard is never recreated once it exists); prefer local, keep remote data
      // safe by not discarding it silently.
      console.warn(`FF-DATA-4: manifest merge saw two different fileIds for shard "${name}"; keeping local.`);
      mergedShards[name] = l;
    } else {
      mergedShards[name] = l || r;
    }
  }

  return {
    schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion),
    businessSettings: mergeBusinessSettings(local.businessSettings, remote.businessSettings),
    categories: Array.from(new Set([...(remote.categories || []), ...(local.categories || [])])),
    shards: mergedShards,
    migration: local.migration || remote.migration,
  };
}

/**
 * Renames a file/folder in place via a metadata-only Drive `files.update` PATCH.
 * Only the `name` field is sent — the file's id, parents, and (for a folder) every
 * child stay exactly where they are. Used to migrate a user's legacy root folder to
 * the new name without creating, moving, copying, or deleting anything.
 */
async function renameFile(token: string, fileId: string, newName: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Drive API Rename Error:', response.status, errorData);
    throw new Error(`Drive API Rename Failed: ${response.status} ${errorData.error?.message || ''}`);
  }
}

/**
 * FF-DATA-1 — Finds, migrates, or creates the user's root data folder.
 *
 * Resolution order (all lookups scoped to this Drive account, via the app's
 * `drive.file` grant):
 *   1. `'tbiz Data'` exists -> already migrated (or a fresh account past its
 *      first run) -> use it as-is.
 *   2. Else legacy `'FinFlow Data'` exists -> RENAME it in place to `'tbiz Data'`
 *      via `renameFile` (metadata-only `files.update` PATCH of the `name` field).
 *      The folder's id and every invoice/expense/receipt file nested inside it
 *      are left exactly where they are — nothing is created, moved, copied, or
 *      deleted. Then use it.
 *   3. Else (brand-new user) -> create a fresh `'tbiz Data'` folder.
 *
 * Edge case (both exist): if a prior migration ran partway (e.g. the app was
 * closed mid-run) so BOTH `'tbiz Data'` and legacy `'FinFlow Data'` are present,
 * we prefer `'tbiz Data'`, leave the legacy folder completely untouched, and
 * console.warn so it can be reconciled by hand. We never merge or delete either
 * folder automatically — data safety over tidiness.
 */
async function resolveRootFolderId(token: string): Promise<string> {
  const tbizId = await findFileId(token, ROOT_FOLDER_NAME, true);
  const legacyId = await findFileId(token, LEGACY_ROOT_FOLDER_NAME, true);

  if (tbizId && legacyId) {
    console.warn(
      `FF-DATA-1: both '${ROOT_FOLDER_NAME}' (id: ${tbizId}) and legacy ` +
      `'${LEGACY_ROOT_FOLDER_NAME}' (id: ${legacyId}) folders exist in this Drive ` +
      `account. Using '${ROOT_FOLDER_NAME}'; the legacy folder was left untouched. ` +
      `Reconcile manually if it still holds data that should be merged.`
    );
    return tbizId;
  }

  if (tbizId) {
    return tbizId;
  }

  if (legacyId) {
    await renameFile(token, legacyId, ROOT_FOLDER_NAME);
    return legacyId;
  }

  return createFile(token, ROOT_FOLDER_NAME, null, true);
}

/**
 * Lists all business folders inside the root tbiz Data folder (migrating the
 * legacy FinFlow Data folder in place on first run — see resolveRootFolderId).
 */
export async function listBusinesses(token: string): Promise<BusinessFolder[]> {
  const rootId = await resolveRootFolderId(token);

  const q = `trashed = false and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder'`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Failed to list businesses');
  const data = await response.json();
  return data.files || [];
}

/**
 * Scans user's Drive for tbiz Data -> [Business Folder] -> app_data.json
 * (migrating the legacy FinFlow Data folder in place on first run — see
 * resolveRootFolderId). Returns fileId and businessFolderId. Creates them if
 * they don't exist.
 */
export async function initAppState(token: string, businessName: string): Promise<{ fileId: string; folderId: string }> {
  // 1-2. Find, migrate, or create root + business folder (factored out below as
  // resolveBusinessFolderId, FF-DATA-4d, so the new sharded bootstrap doesn't
  // duplicate this resolution logic).
  const businessFolderId = await resolveBusinessFolderId(token, businessName);

  // 3. Find or create app data file inside business folder
  let fileId = await findFileId(token, APP_DATA_FILENAME, false, businessFolderId);
  if (!fileId) {
    fileId = await createFile(token, APP_DATA_FILENAME, DEFAULT_STATE, false, businessFolderId);
  }

  return { fileId, folderId: businessFolderId };
}

/**
 * FF-DATA-4d — finds-or-creates just the business folder (steps 1-2 of the legacy
 * `initAppState` above), factored out so both the legacy whole-blob bootstrap and
 * the new split-file bootstrap (`initShardedAppState` below) share one
 * root/business-folder resolution path instead of duplicating it.
 */
async function resolveBusinessFolderId(token: string, businessName: string): Promise<string> {
  const rootId = await resolveRootFolderId(token);
  let businessFolderId = await findFileId(token, businessName, true, rootId);
  if (!businessFolderId) {
    businessFolderId = await createFile(token, businessName, null, true, rootId);
  }
  return businessFolderId;
}

/** Maps a shard name to its collection inside a whole-`AppState` (used by the
 * migration, which reads its one source of truth via the legacy `fetchAppState`). */
function legacyCollectionFor(state: AppState, name: ShardName): (Invoice | Expense | Client | BookingAgent)[] {
  switch (name) {
    case 'invoices':
      return state.invoices;
    case 'expenses':
      return state.expenses;
    case 'clients':
      return state.clients;
    case 'bookingAgents':
      return state.bookingAgents || [];
  }
}

/** Dispatches to the correctly-typed `fetchShard` overload for a variable `name`
 * (the overloaded public signatures aren't individually callable with a widened
 * `ShardName` union, only with one of the literal members). */
async function fetchShardByName(token: string, fileId: string, name: ShardName): Promise<{ id: string }[]> {
  switch (name) {
    case 'invoices':
      return fetchShard(token, fileId, 'invoices');
    case 'expenses':
      return fetchShard(token, fileId, 'expenses');
    case 'clients':
      return fetchShard(token, fileId, 'clients');
    case 'bookingAgents':
      return fetchShard(token, fileId, 'bookingAgents');
  }
}

/**
 * FF-DATA-4d — creates a brand-new business's manifest + 4 empty shards directly,
 * with NO legacy `app_data.json` ever created (§4's "brand-new business" branch).
 * Shards are created before the manifest (same ordering discipline as the
 * migration and the steady-state save path: the manifest must never reference a
 * shard file id that doesn't exist yet).
 *
 * Claim-race dedup (security-validator finding #2 fix): mirrors the migration's
 * claim-race guard (`migrateLegacyToShards` step 2) so two devices bootstrapping
 * the same brand-new business concurrently can't each leave a live orphaned
 * manifest+shard set behind. Checked immediately BEFORE claiming (cheap
 * short-circuit — skip doing any work at all if another device is already
 * visibly ahead) and again immediately AFTER claiming (the authoritative check,
 * same as the migration's — closes the narrow window between the pre-check and
 * this device's own manifest create).
 */
async function createFreshManifestAndShards(
  token: string,
  businessFolderId: string
): Promise<{ manifestFileId: string; manifest: Manifest }> {
  // Pre-check: if another device's bootstrap already finished (or got far enough
  // to have created the manifest) before we started, just use theirs instead of
  // doing any work.
  const preExisting = await findFileId(token, MANIFEST_FILENAME, false, businessFolderId);
  if (preExisting) {
    console.warn(
      `FF-DATA-4d: a manifest already exists for business folder ${businessFolderId} ` +
      `before this device's fresh-bootstrap started; using the existing one instead ` +
      `of creating a duplicate.`
    );
    return { manifestFileId: preExisting, manifest: await fetchManifest(token, preExisting) };
  }

  const shards: Manifest['shards'] = {};
  for (const name of SHARD_WRITE_ORDER) {
    const { id, version } = await createGzipFile(token, SHARD_FILENAMES[name], [], businessFolderId);
    shards[name] = { fileId: id, version, recordCount: 0, updatedAt: new Date().toISOString() };
  }

  const manifest: Manifest = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    businessSettings: { ...DEFAULT_BUSINESS_SETTINGS },
    categories: [...DEFAULT_CATEGORIES],
    shards,
  };
  const created = await createGzipFile(token, MANIFEST_FILENAME, manifest, businessFolderId);

  // Authoritative post-claim check: re-list `manifest.json.gz` by exact name. If
  // more than one now exists, another device's concurrent bootstrap also created
  // one in the same narrow window — this device lost the race. Clean up the
  // manifest + shards it just created (safe: nothing else references them yet,
  // a brand-new business has no data to lose) and defer to the winner's set
  // instead of leaving two live, independently-writable sets in Drive.
  const allManifestIds = await listFileIdsByName(token, MANIFEST_FILENAME, businessFolderId);
  if (allManifestIds.length > 1) {
    console.warn(
      `FF-DATA-4d: concurrent fresh-bootstrap race detected in business folder ` +
      `${businessFolderId} (${allManifestIds.length} '${MANIFEST_FILENAME}' files found). ` +
      `This device lost the race; deleting the manifest + shards it just created and ` +
      `deferring to the other device's bootstrap.`
    );
    await deleteFile(token, created.id).catch(() => {});
    await Promise.all(
      Object.values(shards).map((entry) => deleteFile(token, entry.fileId).catch(() => {}))
    );
    const winningManifestId = await findFileId(token, MANIFEST_FILENAME, false, businessFolderId);
    if (!winningManifestId) {
      // Extremely unlikely (the winner's manifest would have to vanish between our
      // list call and this lookup) — surface a clear error rather than silently
      // returning a manifest that doesn't exist; the caller's load path will retry.
      throw new Error(
        'FF-DATA-4d: lost a concurrent fresh-bootstrap race but could not locate the ' +
        'winning manifest afterward; retry the load.'
      );
    }
    return { manifestFileId: winningManifestId, manifest: await fetchManifest(token, winningManifestId) };
  }

  return { manifestFileId: created.id, manifest };
}

/**
 * FF-DATA-4d — the one-time, idempotent, resumable migration from the legacy
 * monolithic `app_data.json` to the per-entity split-file format (design spec §4).
 * NEVER deletes or modifies `app_data.json` at any step. Safe to invoke on every
 * load: `initShardedAppState` below only calls this when the manifest is absent
 * (fresh claim) or `migration.status === 'in_progress'` (resumed re-entry); a
 * business whose migration is already `'complete'` never reaches this function.
 */
export async function migrateLegacyToShards(
  token: string,
  businessFolderId: string,
  legacyFileId: string,
  existingManifestFileId: string | null
): Promise<{ manifestFileId: string; manifest: Manifest }> {
  // Step 1 — Detect/read. The legacy file is the ONLY source of truth until step 5
  // finalizes below; it is read through the existing, unchanged fetchAppState/
  // normalizeAppState path, same as any whole-blob load.
  const legacyState = await fetchAppState(token, legacyFileId);

  let manifestFileId = existingManifestFileId;
  let manifest: Manifest;
  // FF-DATA-4 hardening (security-validator finding #1) — every manifest write
  // below (the per-shard checkpoint PATCH and the finalize PATCH) is guarded by
  // this Drive `version` token via `saveManifestGuarded`, exactly like the
  // steady-state save path, instead of blindly overwriting with a bare
  // `saveManifest`. This is what makes a concurrent *resume* of the SAME
  // in_progress migration on a second device safe: a version mismatch triggers
  // `mergeManifest` (re-reads each shared shard's actual Drive version, unions
  // the shard index) instead of one device's checkpoint clobbering the other's
  // progress and orphaning shard files.
  let manifestVersion: string;

  if (manifestFileId) {
    // Resume: a prior, interrupted run already claimed the manifest (in_progress).
    manifest = await fetchManifest(token, manifestFileId);
    manifestVersion = await getFileVersion(token, manifestFileId);
  } else {
    // Step 2 — Claim: create the manifest FIRST, announcing in_progress with an
    // empty shard index, before any shard content exists.
    const claim: Manifest = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      businessSettings: { ...DEFAULT_BUSINESS_SETTINGS },
      categories: [...DEFAULT_CATEGORIES],
      shards: {},
      migration: { status: 'in_progress', legacyFileId, startedAt: new Date().toISOString() },
    };
    const created = await createGzipFile(token, MANIFEST_FILENAME, claim, businessFolderId);
    manifestFileId = created.id;
    manifest = claim;
    manifestVersion = created.version;

    // Concurrent-migration race check: re-list `manifest.json.gz` by exact name.
    // If more than one now exists, two devices both detected "no manifest" and
    // both created one in the same narrow window — this device lost the race.
    //
    // Known accepted theoretical edge (security-validator finding #3, left
    // as-is by design, no logic change): if BOTH racing devices' `listFileIdsByName`
    // calls happen to observe the other's manifest before either has self-deleted,
    // both could conclude they lost and both abort. This is self-resolving — the
    // next load on either device simply re-enters `initShardedAppState`, finds no
    // manifest, and re-claims — so it costs an extra retry round-trip at worst,
    // never data loss or a stuck state. Not fixed here per the ticket's scope.
    const allManifestIds = await listFileIdsByName(token, MANIFEST_FILENAME, businessFolderId);
    if (allManifestIds.length > 1) {
      console.warn(
        `FF-DATA-4d: concurrent migration race detected in business folder ` +
        `${businessFolderId} (${allManifestIds.length} '${MANIFEST_FILENAME}' files found). ` +
        `This device lost the race; deleting the manifest it just created (safe — it ` +
        `references zero shard content) and deferring to the other device's migration.`
      );
      await deleteFile(token, manifestFileId).catch(() => {});
      throw new MigrationRaceLostError();
    }
  }

  // Step 3 — write shards ONE AT A TIME, fixed order, PATCHing the manifest's
  // shard index immediately after each individual shard write succeeds. An
  // interruption after shard N leaves the manifest an accurate, resumable record
  // of "shards 1..N done, N+1..4 not yet" rather than an all-or-nothing black box.
  for (const name of SHARD_WRITE_ORDER) {
    const existingEntry = manifest.shards[name];
    const alreadyWritten = existingEntry ? await fileStillResolves(token, existingEntry.fileId) : false;
    if (alreadyWritten) continue; // resumable skip — a prior pass already wrote this shard

    const collection = legacyCollectionFor(legacyState, name);
    const { id, version } = await createGzipFile(token, SHARD_FILENAMES[name], collection, businessFolderId);
    manifest = {
      ...manifest,
      shards: {
        ...manifest.shards,
        [name]: { fileId: id, version, recordCount: collection.length, updatedAt: new Date().toISOString() },
      },
    };
    // Guarded checkpoint write (finding #1 fix): if a concurrent resume on another
    // device wrote the manifest since we last read its version, reconcile via
    // `mergeManifest` (unions the shard index, re-reads each shared shard's actual
    // Drive version) instead of blindly overwriting — adopt the reconciled result
    // so later iterations/finalize see the full, merged picture.
    const checkpoint = await saveManifestGuarded(token, manifestFileId, manifestVersion, manifest);
    manifestVersion = checkpoint.version;
    if (checkpoint.merged) {
      manifest = checkpoint.merged;
    }
  }

  // Step 4 — verify: re-fetch every shard's content and compare it against the
  // legacy source (record counts + first/last-id spot-check). If ANY shard fails
  // this check, STOP without advancing migration.status — the manifest stays
  // 'in_progress' (a safe, resumable state) and the legacy file is untouched, so
  // no data is at risk from this abort.
  for (const name of SHARD_WRITE_ORDER) {
    const entry = manifest.shards[name];
    if (!entry) {
      console.warn(
        `FF-DATA-4d: manifest is missing a shard entry for "${name}" after the write phase; ` +
        `leaving migration.status = 'in_progress' for a resumed retry. app_data.json was not touched.`
      );
      return { manifestFileId, manifest };
    }
    const expected = legacyCollectionFor(legacyState, name);
    const readBack = await fetchShardByName(token, entry.fileId, name);
    if (!shardMatchesLegacy(readBack, expected)) {
      console.warn(
        `FF-DATA-4d: shard "${name}" failed read-back verification against the legacy source ` +
        `(expected ${expected.length} record(s), got ${readBack.length}); leaving ` +
        `migration.status = 'in_progress' for a resumed retry. app_data.json was not touched.`
      );
      return { manifestFileId, manifest };
    }
  }

  // Step 5 — Finalize. Only once every shard verifies clean: a single PATCH that
  // is the commit point — every load from here on takes the split-file branch
  // unconditionally. businessSettings/categories move into the manifest body here
  // (previously it held only migration scaffolding + defaults).
  manifest = {
    ...manifest,
    businessSettings: legacyState.businessSettings,
    categories: legacyState.categories,
    migration: {
      status: 'complete',
      legacyFileId,
      startedAt: manifest.migration?.startedAt,
      migratedAt: new Date().toISOString(),
    },
  };
  // Guarded finalize write (finding #1 fix): same reconciliation as the checkpoint
  // writes above rather than a blind overwrite. `mergeManifest` keeps this device's
  // 'complete' migration status (`local.migration || remote.migration`, and this
  // call's `local` is our just-verified, complete manifest) while still unioning in
  // any shard-index progress a concurrent resumer made that we don't have.
  const finalized = await saveManifestGuarded(token, manifestFileId, manifestVersion, manifest);
  if (finalized.merged) {
    manifest = finalized.merged;
  }

  // Step 6 — app_data.json is NEVER deleted or modified by this function, at any
  // step above. It remains as a permanent, byte-unmodified backup.
  return { manifestFileId, manifest };
}

export interface ShardedInitResult {
  folderId: string;
  manifestFileId: string;
  manifest: Manifest;
  /** The legacy file's id, if one still exists in this business folder (kept as a
   * permanent backup post-migration — see §4/§6 of the design spec). Null only for
   * a business that was always split-file (created directly, never had a blob). */
  legacyFileId: string | null;
}

/**
 * FF-DATA-4d — the split-file-aware bootstrap for a business workspace,
 * implementing the design spec §4 detection table:
 *  - no manifest, no legacy -> brand-new business: shards + manifest created
 *    directly, no legacy file ever created.
 *  - no manifest, legacy present -> run the migration (fresh claim).
 *  - manifest present, `migration.status === 'in_progress'` -> resume the
 *    migration (idempotent re-entry).
 *  - manifest present, `migration.status === 'complete'` (or no migration block
 *    at all — a business that was always split-file) -> normal split-file load;
 *    a still-present legacy file is ignored entirely (expected steady state, not
 *    an error — unlike FF-DATA-1's folder-rename "both exist" case).
 */
export async function initShardedAppState(token: string, businessName: string): Promise<ShardedInitResult> {
  const folderId = await resolveBusinessFolderId(token, businessName);

  const manifestFileId = await findFileId(token, MANIFEST_FILENAME, false, folderId);
  const legacyFileId = await findFileId(token, APP_DATA_FILENAME, false, folderId);

  if (manifestFileId) {
    const manifest = await fetchManifest(token, manifestFileId);
    if (manifest.migration?.status === 'in_progress') {
      const sourceLegacyId = legacyFileId || manifest.migration.legacyFileId;
      if (!sourceLegacyId) {
        // Should not happen (a claimed migration always records its legacyFileId
        // at claim time) — degrade safely rather than crash: treat the workspace
        // as already on the split-file path so the app stays usable.
        console.warn(
          'FF-DATA-4d: manifest.migration.status is in_progress but no legacy file id is ' +
          'resolvable; treating this workspace as split-file without resuming migration.'
        );
        return { folderId, manifestFileId, manifest, legacyFileId };
      }
      const resumed = await migrateLegacyToShards(token, folderId, sourceLegacyId, manifestFileId);
      return { folderId, manifestFileId: resumed.manifestFileId, manifest: resumed.manifest, legacyFileId };
    }
    return { folderId, manifestFileId, manifest, legacyFileId };
  }

  if (legacyFileId) {
    const migrated = await migrateLegacyToShards(token, folderId, legacyFileId, null);
    return { folderId, manifestFileId: migrated.manifestFileId, manifest: migrated.manifest, legacyFileId };
  }

  const created = await createFreshManifestAndShards(token, folderId);
  return { folderId, manifestFileId: created.manifestFileId, manifest: created.manifest, legacyFileId: null };
}

/**
 * Downloads the JSON content.
 */
export async function fetchAppState(token: string, fileId: string): Promise<AppState> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to download app state');
  // F-7 — app_data.json is user-editable in Drive and therefore untrusted. Validate
  // and normalize the parsed shape (drop malformed records, coerce types, strip
  // __proto__/constructor) before any of it reaches the app's sinks or math.
  const raw = await response.json().catch(() => ({}));
  return normalizeAppState(raw);
}

/**
 * F-1 follow-up — downloads an arbitrary Drive file's raw bytes as a Blob using an
 * authenticated `alt=media` request. Receipts are owner-private (no public-read
 * permission), so the browser's cookie-auth `drive.google.com` preview fails when the
 * default Google account differs from the app's connected account. Fetching with that
 * access token sidesteps that and works for both image and PDF receipts; the caller
 * renders the resulting Blob via an object URL. The Blob carries Drive's reported
 * Content-Type so the consumer can branch on image/PDF.
 */
export async function downloadDriveFileBlob(token: string, fileId: string): Promise<Blob> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to download Drive file');
  return response.blob();
}

/** Extracts the Drive file id from a `webViewLink` (e.g. `.../file/d/<id>/view`). */
export function extractDriveFileId(webViewLink: string): string | null {
  return webViewLink.match(/\/d\/([^/]+)/)?.[1] ?? null;
}

/**
 * Overwrites the file content. Returns the new Drive `version` of the file.
 */
export async function saveAppState(token: string, fileId: string, data: AppState): Promise<string> {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=version`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to save app state to Drive');
  const result = await response.json().catch(() => ({}));
  return (result.version as string) || '';
}

/**
 * Reads the monotonic `version` of a Drive file's metadata. Drive bumps this on
 * every content change, so it doubles as an optimistic-concurrency token.
 */
export async function getFileVersion(token: string, fileId: string): Promise<string> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=version`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to read file version from Drive');
  const data = await response.json();
  return (data.version as string) || '';
}

/** Union two record collections by id; local wins on overlap, remote-only records are kept. */
function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of remote) byId.set(r.id, r);
  for (const l of local) byId.set(l.id, l);
  return Array.from(byId.values());
}

/**
 * Merges a remote AppState into the local one (Step 1 strategy):
 * collections are unioned by id with local winning on overlap, so records added
 * on another device are preserved instead of being clobbered. Singletons
 * businessSettings is local-wins; categories are unioned.
 *
 * Known limitation: without per-record timestamps/tombstones this cannot resolve
 * the same record edited on two devices (local wins) and a record deleted locally
 * but still present remotely may reappear. Addressed by the later LWW/tombstone step.
 */
export function mergeAppState(local: AppState, remote: AppState): AppState {
  return {
    expenses: mergeById(local.expenses || [], remote.expenses || []),
    clients: mergeById(local.clients || [], remote.clients || []),
    invoices: mergeById(local.invoices || [], remote.invoices || []),
    bookingAgents: mergeById(local.bookingAgents || [], remote.bookingAgents || []),
    categories: Array.from(new Set([...(remote.categories || []), ...(local.categories || [])])),
    businessSettings: mergeBusinessSettings(local.businessSettings, remote.businessSettings),
  };
}

/**
 * businessSettings is local-wins (the editing device's profile), EXCEPT the
 * gapless document counters (1a), which must be max-merged: if two devices each
 * advanced a counter while offline, taking the higher value prevents the next
 * document from reusing a number the other device already issued.
 */
function mergeBusinessSettings(local: BusinessSettings, remote: BusinessSettings): BusinessSettings {
  const localCounters = local?.docCounters || {};
  const remoteCounters = remote?.docCounters || {};
  const mergedCounters: BusinessSettings['docCounters'] = { ...localCounters };
  for (const [type, value] of Object.entries(remoteCounters) as [keyof typeof remoteCounters, number][]) {
    const localValue = mergedCounters[type] ?? 0;
    if (value > localValue) mergedCounters[type] = value;
  }
  return { ...local, docCounters: mergedCounters };
}

/**
 * Optimistic-concurrency save. Before overwriting, checks whether the file's
 * Drive `version` still matches the one this device last saw (`expectedVersion`).
 * If it does, we save directly. If another device wrote in the meantime, we
 * refetch the remote state, merge it with ours, and retry — so a concurrent
 * write is merged instead of silently lost.
 *
 * Returns the new version and, when a merge happened, the merged state so the
 * caller can adopt the other device's changes locally.
 */
export async function saveAppStateGuarded(
  token: string,
  fileId: string,
  expectedVersion: string | null,
  localState: AppState
): Promise<{ version: string; merged: AppState | null }> {
  let expected = expectedVersion;
  let stateToSave = localState;
  let didMerge = false;
  const MAX_ATTEMPTS = 4;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await getFileVersion(token, fileId);
    if (current === expected) {
      const version = await saveAppState(token, fileId, stateToSave);
      return { version, merged: didMerge ? stateToSave : null };
    }
    // Conflict: another device wrote since we loaded. Merge and retry.
    const remote = await fetchAppState(token, fileId);
    stateToSave = mergeAppState(stateToSave, remote);
    expected = current;
    didMerge = true;
  }

  // Exhausted retries (rapid concurrent writers) — persist the best merged result.
  const version = await saveAppState(token, fileId, stateToSave);
  return { version, merged: stateToSave };
}

/**
 * Deletes a file from Google Drive by its ID.
 */
export async function deleteFile(token: string, fileId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok && response.status !== 404) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Drive API Delete Error:', response.status, errorData);
    throw new Error(`Drive API Delete Failed: ${response.status} ${errorData.error?.message || ''}`);
  }
}

/**
 * F-1 — Uploaded invoice PDFs and receipts are NO LONGER made
 * `anyone-with-the-link` readable. These files contain customer PII, tax IDs and
 * financial figures; a permanent public link (distributed over email/WhatsApp) was a
 * lasting unauthenticated-exposure vector. Files now stay private to the owner.
 *
 * - Email delivery already attaches the PDF, so it needs no public link.
 * - WhatsApp delivery now shares the actual PDF file through the native share sheet
 *   (see services/share.ts) instead of a public Drive link.
 *
 * The returned Drive `webViewLink` still works for the OWNER (e.g. opening their own
 * archive); it just no longer grants access to anyone else.
 */

/**
 * Uploads a PDF blob to the "Invoices" folder inside the business folder.
 * Returns the owner-only Drive URL (private; not publicly shareable).
 */
export async function uploadInvoicePDF(token: string, invoiceId: string, pdfBlob: Blob, businessFolderId: string): Promise<string> {
  let invoicesFolderId = await findFileId(token, INVOICES_FOLDER_NAME, true, businessFolderId);
  if (!invoicesFolderId) {
    invoicesFolderId = await createFile(token, INVOICES_FOLDER_NAME, null, true, businessFolderId);
  }

  const filename = `invoice_${invoiceId}.pdf`;
  const fileMetadata = { name: filename, parents: [invoicesFolderId] };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
  form.append('file', pdfBlob, filename);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Failed to upload invoice PDF: ${err.error?.message || response.status}`);
  }

  const data: DriveFile = await response.json();
  return data.webViewLink || '';
}

/**
 * Creates "Business App Receipts" folder inside the specific business folder and uploads file.
 * Automatically nests the file inside a year-specific folder (e.g., "2025").
 */
export async function uploadReceiptToDrive(token: string, file: File, metadata: { vendor: string; date: string }, businessFolderId: string): Promise<string> {
  // 1. Find or create receipts folder "Business App Receipts" inside business folder
  let receiptsFolderId = await findFileId(token, RECEIPTS_FOLDER_NAME, true, businessFolderId);
  if (!receiptsFolderId) {
    receiptsFolderId = await createFile(token, RECEIPTS_FOLDER_NAME, null, true, businessFolderId);
  }

  // 2. Extract year and find or create year folder inside receipts folder
  const year = new Date(metadata.date).getFullYear().toString();
  let yearFolderId = await findFileId(token, year, true, receiptsFolderId);
  if (!yearFolderId) {
    yearFolderId = await createFile(token, year, null, true, receiptsFolderId);
  }

  const filename = `${metadata.date}_${metadata.vendor}_${file.name}`;
  const fileMetadata = {
    name: filename,
    parents: [yearFolderId],
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
  form.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  
  if (!response.ok) throw new Error('Failed to upload receipt');
  const data: DriveFile = await response.json();

  // F-1 — receipts stay private to the owner; no public permission is set. Receipts
  // are never shared by link (only referenced in the owner's own expense records).
  return data.webViewLink || '';
}
