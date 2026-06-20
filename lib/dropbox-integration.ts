/**
 * Dropbox Integration for ProtoKI
 * 
 * Real Dropbox OAuth2 integration with direct API upload.
 * - OAuth2 flow via server proxy (handles token exchange)
 * - Direct file upload to Dropbox via API
 * - Automatic token refresh
 * - Folder creation per project
 * - Fallback to share sheet if OAuth not configured
 */
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Alert } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";

// Storage keys
const DROPBOX_SETTINGS_KEY = "@dropbox_settings";
const DROPBOX_UPLOAD_HISTORY_KEY = "@dropbox_upload_history";
const DROPBOX_TOKENS_KEY = "dropbox_tokens"; // SecureStore

export interface DropboxSettings {
  enabled: boolean;
  autoUploadPdf: boolean;
  autoUploadPhotos: boolean;
  baseFolderPath: string; // e.g., "/ProtoKI" or "/Bauprojekte"
  useProjectSubfolders: boolean;
  fileNamingPattern: "project_date" | "number_title" | "custom";
  customPattern?: string;
  lastSyncAt?: string;
  // OAuth state
  isConnected: boolean;
  accountName?: string;
  accountEmail?: string;
  accountId?: string;
}

export interface DropboxTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // timestamp
  accountId: string | null;
}

export interface DropboxUploadEntry {
  id: string;
  fileName: string;
  projectName?: string;
  protocolTitle?: string;
  fileType: "pdf" | "photo" | "excel" | "report";
  timestamp: number;
  success: boolean;
  error?: string;
  dropboxPath?: string;
}

const DEFAULT_SETTINGS: DropboxSettings = {
  enabled: false,
  autoUploadPdf: true,
  autoUploadPhotos: false,
  baseFolderPath: "/ProtoKI",
  useProjectSubfolders: true,
  fileNamingPattern: "project_date",
  isConnected: false,
};

// ============ Settings ============

export async function getDropboxSettings(): Promise<DropboxSettings> {
  try {
    const raw = await AsyncStorage.getItem(DROPBOX_SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveDropboxSettings(settings: Partial<DropboxSettings>): Promise<void> {
  const current = await getDropboxSettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(DROPBOX_SETTINGS_KEY, JSON.stringify(updated));
}

// ============ Token Management ============

async function getTokens(): Promise<DropboxTokens | null> {
  try {
    if (Platform.OS === "web") {
      const raw = await AsyncStorage.getItem(DROPBOX_TOKENS_KEY);
      return raw ? JSON.parse(raw) : null;
    }
    const raw = await SecureStore.getItemAsync(DROPBOX_TOKENS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: DropboxTokens): Promise<void> {
  const json = JSON.stringify(tokens);
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(DROPBOX_TOKENS_KEY, json);
  } else {
    await SecureStore.setItemAsync(DROPBOX_TOKENS_KEY, json);
  }
}

async function clearTokens(): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(DROPBOX_TOKENS_KEY);
  } else {
    await SecureStore.deleteItemAsync(DROPBOX_TOKENS_KEY);
  }
}

/**
 * Get a valid access token, refreshing if expired.
 */
async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  if (!tokens) return null;

  // Check if token is still valid (with 5 min buffer)
  if (tokens.expiresAt > Date.now() + 5 * 60 * 1000) {
    return tokens.accessToken;
  }

  // Token expired - try to refresh
  if (!tokens.refreshToken) {
    // No refresh token, need to re-authenticate
    await clearTokens();
    await saveDropboxSettings({ isConnected: false });
    return null;
  }

  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/dropbox/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!response.ok) {
      await clearTokens();
      await saveDropboxSettings({ isConnected: false });
      return null;
    }

    const data = await response.json();
    const updatedTokens: DropboxTokens = {
      ...tokens,
      accessToken: data.accessToken,
      expiresAt: Date.now() + (data.expiresIn || 14400) * 1000,
    };
    await saveTokens(updatedTokens);
    return updatedTokens.accessToken;
  } catch {
    return null;
  }
}

// ============ OAuth Flow ============

/**
 * Start the Dropbox OAuth connection flow.
 * Opens the Dropbox authorization page in a browser.
 */
export async function connectDropbox(): Promise<{ success: boolean; error?: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    const state = Math.random().toString(36).substring(7);

    // Get the authorization URL from our server
    const response = await fetch(`${baseUrl}/api/dropbox/auth-url?state=${state}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.error || "Server nicht erreichbar" };
    }

    const { authorizeUrl } = await response.json();

    if (Platform.OS === "web") {
      // On web, redirect to Dropbox auth page
      window.location.href = authorizeUrl;
      return { success: true };
    }

    // On native, open auth session
    const redirectUri = `${baseUrl}/api/dropbox/callback`;
    const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri);

    if (result.type === "success" && result.url) {
      // Parse the redirect URL for tokens
      const url = new URL(result.url);
      const code = url.searchParams.get("code");

      if (code) {
        // Exchange code for tokens via our server
        const exchangeResponse = await fetch(`${baseUrl}/api/dropbox/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!exchangeResponse.ok) {
          return { success: false, error: "Token-Austausch fehlgeschlagen" };
        }

        const tokens = await exchangeResponse.json();
        await saveTokens({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: Date.now() + (tokens.expiresIn || 14400) * 1000,
          accountId: tokens.accountId,
        });

        // Get account info
        const accountInfo = await getAccountInfo(tokens.accessToken);
        await saveDropboxSettings({
          isConnected: true,
          enabled: true,
          accountName: accountInfo?.name || "",
          accountEmail: accountInfo?.email || "",
          accountId: tokens.accountId || "",
        });

        return { success: true };
      }
    }

    return { success: false, error: "Autorisierung abgebrochen" };
  } catch (error: any) {
    return { success: false, error: error.message || "Verbindung fehlgeschlagen" };
  }
}

/**
 * Handle OAuth callback parameters (for web redirect flow)
 */
export async function handleDropboxCallback(params: Record<string, string>): Promise<boolean> {
  if (params.access_token) {
    await saveTokens({
      accessToken: params.access_token,
      refreshToken: params.refresh_token || null,
      expiresAt: Date.now() + (parseInt(params.expires_in) || 14400) * 1000,
      accountId: params.account_id || null,
    });

    const accountInfo = await getAccountInfo(params.access_token);
    await saveDropboxSettings({
      isConnected: true,
      enabled: true,
      accountName: accountInfo?.name || "",
      accountEmail: accountInfo?.email || "",
      accountId: params.account_id || "",
    });

    return true;
  }
  return false;
}

/**
 * Disconnect Dropbox (revoke tokens)
 */
export async function disconnectDropbox(): Promise<void> {
  const tokens = await getTokens();
  if (tokens?.accessToken) {
    try {
      // Revoke token at Dropbox
      await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
    } catch {
      // Ignore revocation errors
    }
  }

  await clearTokens();
  await saveDropboxSettings({
    isConnected: false,
    accountName: undefined,
    accountEmail: undefined,
    accountId: undefined,
  });
}

/**
 * Check if Dropbox is connected and token is valid
 */
export async function isDropboxConnected(): Promise<boolean> {
  const token = await getValidAccessToken();
  return token !== null;
}

// ============ File Operations ============

/**
 * Upload a PDF file directly to Dropbox via API
 */
export async function uploadPdfToDropbox(
  pdfUri: string,
  options: {
    projectName?: string;
    protocolTitle?: string;
    protocolNumber?: string;
    protocolDate?: string;
  }
): Promise<{ success: boolean; error?: string; dropboxPath?: string }> {
  try {
    const settings = await getDropboxSettings();
    const accessToken = await getValidAccessToken();

    // If not connected via OAuth, fall back to share sheet
    if (!accessToken) {
      return await uploadViaShareSheet(pdfUri, settings, options);
    }

    // Build the target path in Dropbox
    const fileName = buildFileName(settings, options);
    let targetPath = settings.baseFolderPath;
    if (settings.useProjectSubfolders && options.projectName) {
      targetPath += `/${sanitizePath(options.projectName)}`;
    }
    targetPath += `/${fileName}`;

    // Ensure folder exists
    const folderPath = targetPath.substring(0, targetPath.lastIndexOf("/"));
    await ensureFolder(accessToken, folderPath);

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Upload via server proxy (handles large files better)
    const baseUrl = getApiBaseUrl();
    const uploadResponse = await fetch(`${baseUrl}/api/dropbox/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken,
        base64Content: base64,
        path: targetPath,
        mimeType: "application/pdf",
      }),
    });

    if (!uploadResponse.ok) {
      const errData = await uploadResponse.json().catch(() => ({}));
      
      // If token expired, try refresh and retry once
      if (uploadResponse.status === 401 && errData.needsRefresh) {
        const newToken = await getValidAccessToken();
        if (newToken) {
          const retryResponse = await fetch(`${baseUrl}/api/dropbox/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken: newToken,
              base64Content: base64,
              path: targetPath,
              mimeType: "application/pdf",
            }),
          });
          if (retryResponse.ok) {
            const result = await retryResponse.json();
            await recordUpload({ fileName, projectName: options.projectName, protocolTitle: options.protocolTitle, fileType: "pdf", success: true, dropboxPath: result.path });
            return { success: true, dropboxPath: result.path };
          }
        }
        return { success: false, error: "Token abgelaufen – bitte erneut verbinden" };
      }

      throw new Error(errData.error || "Upload fehlgeschlagen");
    }

    const result = await uploadResponse.json();
    await recordUpload({ fileName, projectName: options.projectName, protocolTitle: options.protocolTitle, fileType: "pdf", success: true, dropboxPath: result.path });
    
    await saveDropboxSettings({ lastSyncAt: new Date().toISOString() });
    return { success: true, dropboxPath: result.path };
  } catch (error: any) {
    await recordUpload({
      fileName: options.protocolTitle || "unknown",
      projectName: options.projectName,
      protocolTitle: options.protocolTitle,
      fileType: "pdf",
      success: false,
      error: error.message,
    });
    return { success: false, error: error.message || "Upload fehlgeschlagen" };
  }
}

/**
 * Upload photos to Dropbox
 */
export async function uploadPhotosToDropbox(
  photoUris: string[],
  options: {
    projectName?: string;
    protocolTitle?: string;
    protocolDate?: string;
  }
): Promise<{ success: boolean; uploadedCount: number; error?: string }> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { success: false, uploadedCount: 0, error: "Nicht mit Dropbox verbunden" };
  }

  const settings = await getDropboxSettings();
  let targetFolder = settings.baseFolderPath;
  if (settings.useProjectSubfolders && options.projectName) {
    targetFolder += `/${sanitizePath(options.projectName)}`;
  }
  targetFolder += "/Fotos";

  await ensureFolder(accessToken, targetFolder);

  let uploadedCount = 0;
  const baseUrl = getApiBaseUrl();
  const date = options.protocolDate || new Date().toISOString().split("T")[0];

  for (let i = 0; i < photoUris.length; i++) {
    try {
      const base64 = await FileSystem.readAsStringAsync(photoUris[i], {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileName = `${date}_Foto_${String(i + 1).padStart(2, "0")}.jpg`;
      const response = await fetch(`${baseUrl}/api/dropbox/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          base64Content: base64,
          path: `${targetFolder}/${fileName}`,
          mimeType: "image/jpeg",
        }),
      });

      if (response.ok) {
        uploadedCount++;
      }
    } catch {
      // Continue with next photo
    }
  }

  return { success: uploadedCount > 0, uploadedCount };
}

/**
 * Auto-upload PDF after protocol generation (if enabled)
 */
export async function autoUploadIfEnabled(
  pdfUri: string,
  options: {
    projectName?: string;
    protocolTitle?: string;
    protocolNumber?: string;
    protocolDate?: string;
  }
): Promise<void> {
  const settings = await getDropboxSettings();
  if (!settings.enabled || !settings.autoUploadPdf || !settings.isConnected) return;

  const result = await uploadPdfToDropbox(pdfUri, options);
  if (result.success) {
    console.log(`[Dropbox] Auto-upload successful: ${result.dropboxPath}`);
  } else {
    console.warn(`[Dropbox] Auto-upload failed: ${result.error}`);
  }
}

// ============ Helpers ============

async function ensureFolder(accessToken: string, path: string): Promise<void> {
  try {
    const baseUrl = getApiBaseUrl();
    await fetch(`${baseUrl}/api/dropbox/create-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, path }),
    });
  } catch {
    // Folder might already exist, ignore errors
  }
}

async function getAccountInfo(accessToken: string): Promise<{ name: string; email: string } | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/dropbox/account-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback: Upload via system share sheet (when OAuth not configured)
 */
async function uploadViaShareSheet(
  pdfUri: string,
  settings: DropboxSettings,
  options: {
    projectName?: string;
    protocolTitle?: string;
    protocolNumber?: string;
    protocolDate?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const fileName = buildFileName(settings, options);
    const namedUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.copyAsync({ from: pdfUri, to: namedUri });

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, error: "Teilen nicht verfügbar" };
    }

    await Sharing.shareAsync(namedUri, {
      mimeType: "application/pdf",
      dialogTitle: `PDF in Dropbox speichern: ${fileName}`,
      UTI: "com.adobe.pdf",
    });

    await recordUpload({ fileName, projectName: options.projectName, protocolTitle: options.protocolTitle, fileType: "pdf", success: true });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Upload fehlgeschlagen" };
  }
}

function buildFileName(
  settings: DropboxSettings,
  options: {
    projectName?: string;
    protocolTitle?: string;
    protocolNumber?: string;
    protocolDate?: string;
  }
): string {
  const date = options.protocolDate || new Date().toISOString().split("T")[0];
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_").replace(/_+/g, "_");

  switch (settings.fileNamingPattern) {
    case "project_date": {
      const parts: string[] = [];
      if (options.projectName) parts.push(sanitize(options.projectName));
      parts.push(date);
      if (options.protocolTitle) parts.push(sanitize(options.protocolTitle.slice(0, 30)));
      return parts.join("_") + ".pdf";
    }
    case "number_title": {
      const parts: string[] = [];
      if (options.protocolNumber) parts.push(options.protocolNumber);
      if (options.protocolTitle) parts.push(sanitize(options.protocolTitle.slice(0, 40)));
      else parts.push(date);
      return parts.join("_") + ".pdf";
    }
    case "custom": {
      let pattern = settings.customPattern || "{project}_{date}_{title}";
      pattern = pattern
        .replace("{project}", sanitize(options.projectName || "Projekt"))
        .replace("{date}", date)
        .replace("{title}", sanitize(options.protocolTitle || "Protokoll"))
        .replace("{number}", options.protocolNumber || "");
      return pattern + ".pdf";
    }
    default:
      return `${sanitize(options.projectName || "Protokoll")}_${date}.pdf`;
  }
}

function sanitizePath(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, "").trim();
}

// ============ Upload History ============

async function recordUpload(entry: Omit<DropboxUploadEntry, "id" | "timestamp">): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DROPBOX_UPLOAD_HISTORY_KEY);
    const history: DropboxUploadEntry[] = raw ? JSON.parse(raw) : [];
    history.unshift({
      ...entry,
      id: `dbx_${Date.now()}`,
      timestamp: Date.now(),
    });
    await AsyncStorage.setItem(DROPBOX_UPLOAD_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  } catch {}
}

export async function getUploadHistory(): Promise<DropboxUploadEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(DROPBOX_UPLOAD_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearUploadHistory(): Promise<void> {
  await AsyncStorage.removeItem(DROPBOX_UPLOAD_HISTORY_KEY);
}

/**
 * Upload multiple files to Dropbox (e.g., photos + PDF)
 * Kept for backward compatibility
 */
export async function uploadFilesToDropbox(
  files: Array<{ uri: string; mimeType: string; fileName: string }>,
  options: {
    projectName?: string;
    protocolTitle?: string;
  }
): Promise<{ success: boolean; uploadedCount: number; error?: string }> {
  if (files.length === 0) {
    return { success: false, uploadedCount: 0, error: "Keine Dateien zum Hochladen" };
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    // Fallback to share sheet for first file
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        return { success: false, uploadedCount: 0, error: "Teilen nicht verfügbar" };
      }
      await Sharing.shareAsync(files[0].uri, {
        mimeType: files[0].mimeType,
        dialogTitle: `${files.length} Dateien in Dropbox speichern`,
      });
      return { success: true, uploadedCount: 1 };
    } catch (error: any) {
      return { success: false, uploadedCount: 0, error: error.message };
    }
  }

  // Upload all files via API
  const settings = await getDropboxSettings();
  let targetFolder = settings.baseFolderPath;
  if (settings.useProjectSubfolders && options.projectName) {
    targetFolder += `/${sanitizePath(options.projectName)}`;
  }

  await ensureFolder(accessToken, targetFolder);

  let uploadedCount = 0;
  const baseUrl = getApiBaseUrl();

  for (const file of files) {
    try {
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await fetch(`${baseUrl}/api/dropbox/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          base64Content: base64,
          path: `${targetFolder}/${file.fileName}`,
          mimeType: file.mimeType,
        }),
      });

      if (response.ok) uploadedCount++;
    } catch {
      // Continue with next file
    }
  }

  return { success: uploadedCount > 0, uploadedCount };
}
