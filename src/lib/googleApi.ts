import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Drive and Sheets scopes
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // Try to get token from sessionStorage just for hot reloads, but we respect the instruction not to cache access tokens long term in localStorage/sessionStorage.
        // We will prompt user to log in if we don't have it in memory.
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in with Google
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Geen toegangstoken ontvangen van Google Auth.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Inlogfout Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

/**
 * Google Drive & Sheets API Operations
 */

// Helper to make Google API requests with proper headers
async function googleFetch(url: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Niet geauthenticeerd bij Google. Log opnieuw in.");
  }

  const headers = {
    ...options.headers,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: { message: "Onbekende fout" } }));
    throw new Error(errorData.error?.message || `Google API fout: ${response.statusText}`);
  }

  return response.json();
}

// 1. Create Folder on Google Drive
export async function createFolderOnDrive(folderName: string): Promise<string> {
  // First, let's search if the folder already exists to prevent duplicate folders
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`;
  const searchResults = await googleFetch(searchUrl);
  if (searchResults.files && searchResults.files.length > 0) {
    return searchResults.files[0].id;
  }

  // If not exists, create it
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  const result = await googleFetch(createUrl, {
    method: 'POST',
    body: JSON.stringify(folderMetadata),
  });

  return result.id;
}

// 2. Create Spreadsheet inside a specific Google Drive folder
export async function createSpreadsheetInFolder(folderId: string, spreadsheetName: string): Promise<string> {
  // Search if spreadsheet already exists in this folder
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(spreadsheetName)}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id)`;
  const searchResults = await googleFetch(searchUrl);
  if (searchResults.files && searchResults.files.length > 0) {
    return searchResults.files[0].id;
  }

  // Create Spreadsheet inside folder
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const fileMetadata = {
    name: spreadsheetName,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [folderId],
  };

  const result = await googleFetch(createUrl, {
    method: 'POST',
    body: JSON.stringify(fileMetadata),
  });

  const spreadsheetId = result.id;

  // Initialize spreadsheet headers
  await initSpreadsheetHeaders(spreadsheetId);

  return spreadsheetId;
}

// 3. Initialize Sheets with Columns
async function initSpreadsheetHeaders(spreadsheetId: string) {
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:C1:append?valueInputOption=USER_ENTERED`;
  const body = {
    values: [
      ["Tijdstip", "Uitgesproken Tekst", "Samenvatting door Gemini"]
    ]
  };

  await googleFetch(appendUrl, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// 4. Save transcription and summary row in Google Sheets
export interface SaveRecordingResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

export async function saveRecordingToGoogleSheets(
  text: string,
  summary: string
): Promise<SaveRecordingResult> {
  // Step 1: Create or get the folder
  const folderId = await createFolderOnDrive("Spraakopname App");

  // Step 2: Create or get the spreadsheet inside that folder
  const spreadsheetId = await createSpreadsheetInFolder(folderId, "Spraakopnamen en Samenvattingen");

  // Step 3: Append the recording data
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:C:append?valueInputOption=USER_ENTERED`;
  const timestamp = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Brussels' });
  const body = {
    values: [
      [timestamp, text, summary]
    ]
  };

  await googleFetch(appendUrl, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return {
    spreadsheetId,
    spreadsheetUrl
  };
}

// 5. Optionally fetch the last few recordings to show a dynamic log!
export interface RecordingRow {
  timestamp: string;
  text: string;
  summary: string;
}

export async function fetchRecordingHistory(): Promise<RecordingRow[]> {
  try {
    const folderId = await createFolderOnDrive("Spraakopname App");
    const spreadsheetId = await createSpreadsheetInFolder(folderId, "Spraakopnamen en Samenvattingen");

    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A2:C100`;
    const response = await googleFetch(getUrl);

    if (!response.values || response.values.length === 0) {
      return [];
    }

    return response.values.map((row: any) => ({
      timestamp: row[0] || "",
      text: row[1] || "",
      summary: row[2] || "",
    })).reverse(); // Show latest first
  } catch (error) {
    console.error("Fout bij ophalen geschiedenis:", error);
    return [];
  }
}
