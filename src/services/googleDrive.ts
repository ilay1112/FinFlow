import type { Expense, Client, Invoice, BusinessSettings, BookingAgent } from '../context/FinanceContext';
import { normalizeAppState } from '../utils/appStateSchema';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_CATEGORIES } from '../config/defaults';

const ROOT_FOLDER_NAME = 'tbiz Data';
// FF-DATA-1 — pre-rebrand folder name. Existing users' Drive data still lives
// under this name; resolveRootFolderId() migrates it to ROOT_FOLDER_NAME (a
// metadata-only rename, id/children preserved) the first time they load after
// the rebrand. Never remove this without confirming no live folder still uses it.
const LEGACY_ROOT_FOLDER_NAME = 'FinFlow Data';
const APP_DATA_FILENAME = 'app_data.json';
const RECEIPTS_FOLDER_NAME = 'Business App Receipts';
const INVOICES_FOLDER_NAME = 'Invoices';

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
  // 1. Find, migrate, or create root folder
  const rootId = await resolveRootFolderId(token);

  // 2. Find or create business folder
  let businessFolderId = await findFileId(token, businessName, true, rootId);
  if (!businessFolderId) {
    businessFolderId = await createFile(token, businessName, null, true, rootId);
  }

  // 3. Find or create app data file inside business folder
  let fileId = await findFileId(token, APP_DATA_FILENAME, false, businessFolderId);
  if (!fileId) {
    fileId = await createFile(token, APP_DATA_FILENAME, DEFAULT_STATE, false, businessFolderId);
  }
  
  return { fileId, folderId: businessFolderId };
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
