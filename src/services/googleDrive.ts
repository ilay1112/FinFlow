import type { Expense, Client, Invoice, BusinessSettings, BookingAgent } from '../context/FinanceContext';

const ROOT_FOLDER_NAME = 'FinFlow Data';
const APP_DATA_FILENAME = 'app_data.json';
const RECEIPTS_FOLDER_NAME = 'Business App Receipts';

export interface AppState {
  expenses: Expense[];
  clients: Client[];
  invoices: Invoice[];
  categories: string[];
  bookingAgents?: BookingAgent[];
  taxRate: number;
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
  categories: ['Software', 'Rent', 'Supplies', 'Marketing', 'Utilities', 'Travel', 'Other'],
  bookingAgents: [],
  taxRate: 20,
  businessSettings: {} as BusinessSettings
};

/**
 * Searches for a file by name. Returns the file ID or null.
 */
async function findFileId(token: string, name: string, isFolder: boolean = false, parentId: string = 'root'): Promise<string | null> {
  const q = `name = '${name}' and trashed = false and '${parentId}' in parents${isFolder ? " and mimeType = 'application/vnd.google-apps.folder'" : ""}`;
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
 * Lists all business folders inside the root FinFlow Data folder.
 */
export async function listBusinesses(token: string): Promise<BusinessFolder[]> {
  let rootId = await findFileId(token, ROOT_FOLDER_NAME, true);
  if (!rootId) {
    rootId = await createFile(token, ROOT_FOLDER_NAME, null, true);
    return [];
  }

  const q = `trashed = false and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder'`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Failed to list businesses');
  const data = await response.json();
  return data.files || [];
}

/**
 * Scans user's Drive for FinFlow Data -> [Business Folder] -> app_data.json. 
 * Returns fileId and businessFolderId. Creates them if they don't exist.
 */
export async function initAppState(token: string, businessName: string): Promise<{ fileId: string; folderId: string }> {
  // 1. Find or create root folder
  let rootId = await findFileId(token, ROOT_FOLDER_NAME, true);
  if (!rootId) {
    rootId = await createFile(token, ROOT_FOLDER_NAME, null, true);
  }

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
  return await response.json();
}

/**
 * Overwrites the file content.
 */
export async function saveAppState(token: string, fileId: string, data: AppState): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to save app state to Drive');
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
 * Sets the permission of a file to "anyone with the link" as a reader.
 * This prevents "You need access" errors when the user is logged into multiple Google accounts.
 */
async function setPublicPermission(token: string, fileId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  });
  
  if (!response.ok) {
    console.warn('Failed to set public permission on file:', fileId);
  }
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
  
  // Explicitly set public permission to avoid account switching errors
  if (data.id) {
    await setPublicPermission(token, data.id);
  }

  return data.webViewLink || '';
}
