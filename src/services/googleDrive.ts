const APP_DATA_FILENAME = 'business_app_data.json';
const RECEIPTS_FOLDER_NAME = 'Business App Receipts';

export interface AppState {
  expenses: Record<string, unknown>[];
  clients: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  categories: string[];
  taxRate: number;
  businessSettings: Record<string, unknown>;
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

const DEFAULT_STATE: AppState = {
  expenses: [],
  clients: [],
  invoices: [],
  categories: ['Software', 'Rent', 'Supplies', 'Marketing', 'Utilities', 'Travel', 'Other'],
  taxRate: 20,
  businessSettings: {}
};

/**
 * Searches for a file by name. Returns the file ID or null.
 */
async function findFileId(token: string, name: string, isFolder: boolean = false): Promise<string | null> {
  const q = `name = '${name}' and trashed = false${isFolder ? " and mimeType = 'application/vnd.google-apps.folder'" : ""}`;
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
 * Scans user's Drive for business_app_data.json. Returns fileId.
 * Creates it if it doesn't exist.
 */
export async function initAppState(token: string): Promise<string> {
  let fileId = await findFileId(token, APP_DATA_FILENAME);
  if (!fileId) {
    fileId = await createFile(token, APP_DATA_FILENAME, DEFAULT_STATE);
  }
  return fileId;
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
 * Creates "Business App Receipts" folder and uploads file.
 */
export async function uploadReceiptToDrive(token: string, file: File, metadata: { vendor: string; date: string }): Promise<string> {
  let folderId = await findFileId(token, RECEIPTS_FOLDER_NAME, true);
  if (!folderId) {
    folderId = await createFile(token, RECEIPTS_FOLDER_NAME, null, true);
    // Also make the folder "anyone with link" if desired, but let's stick to files for now
  }

  const filename = `${metadata.date}_${metadata.vendor}_${file.name}`;
  const fileMetadata = {
    name: filename,
    parents: [folderId],
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
