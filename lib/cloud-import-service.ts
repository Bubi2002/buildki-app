import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export type CloudProvider = "device" | "dropbox" | "google-drive" | "icloud" | "onedrive";

export type ImportedFile = {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  source: CloudProvider;
  importedAt: string;
};

export type FileCategory = "plan" | "document" | "photo" | "all";

const MIME_TYPES: Record<FileCategory, string[]> = {
  plan: ["image/jpeg", "image/png", "image/webp", "application/pdf", "image/tiff"],
  document: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
  photo: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  all: ["*/*"],
};

/**
 * Import files from cloud storage or device.
 * On iOS, this opens the native Files app which includes iCloud, Dropbox, Google Drive, OneDrive etc.
 * On Android, this opens the system file picker which includes Drive, Dropbox, OneDrive etc.
 * On Web, this opens the native file dialog.
 */
export async function importFromCloud(options: {
  category?: FileCategory;
  multiple?: boolean;
}): Promise<ImportedFile[]> {
  const { category = "all", multiple = false } = options;

  try {
    const mimeTypes = MIME_TYPES[category];
    const result = await DocumentPicker.getDocumentAsync({
      type: mimeTypes,
      multiple,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets) {
      return [];
    }

    const importedFiles: ImportedFile[] = [];

    for (const asset of result.assets) {
      // Copy to persistent app storage
      const fileName = sanitizeFileName(asset.name);
      const destDir = `${FileSystem.documentDirectory}imports/`;
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      const destUri = `${destDir}${Date.now()}_${fileName}`;

      await FileSystem.copyAsync({ from: asset.uri, to: destUri });

      const source = detectCloudSource(asset.uri, asset.name);

      importedFiles.push({
        id: `import-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        name: asset.name,
        uri: destUri,
        mimeType: asset.mimeType || "application/octet-stream",
        size: asset.size || 0,
        source,
        importedAt: new Date().toISOString(),
      });
    }

    return importedFiles;
  } catch (error) {
    console.error("Cloud import error:", error);
    return [];
  }
}

/**
 * Import specifically for floor plans (images and PDFs)
 */
export async function importPlanFromCloud(): Promise<ImportedFile | null> {
  const files = await importFromCloud({ category: "plan", multiple: false });
  return files.length > 0 ? files[0] : null;
}

/**
 * Import multiple documents
 */
export async function importDocumentsFromCloud(): Promise<ImportedFile[]> {
  return importFromCloud({ category: "document", multiple: true });
}

/**
 * Import photos from cloud
 */
export async function importPhotosFromCloud(): Promise<ImportedFile[]> {
  return importFromCloud({ category: "photo", multiple: true });
}

/**
 * Detect which cloud provider the file likely came from based on URI patterns
 */
function detectCloudSource(uri: string, name: string): CloudProvider {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.includes("dropbox") || lowerUri.includes("com.getdropbox")) return "dropbox";
  if (lowerUri.includes("google") || lowerUri.includes("com.google")) return "google-drive";
  if (lowerUri.includes("icloud") || lowerUri.includes("mobiledocuments")) return "icloud";
  if (lowerUri.includes("onedrive") || lowerUri.includes("microsoft")) return "onedrive";
  return "device";
}

/**
 * Sanitize file name for safe storage
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9äöüÄÖÜß._\-]/g, "_").substring(0, 100);
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Get icon name for cloud provider
 */
export function getProviderIcon(provider: CloudProvider): string {
  switch (provider) {
    case "dropbox": return "cloud";
    case "google-drive": return "add-to-drive";
    case "icloud": return "cloud-queue";
    case "onedrive": return "cloud-circle";
    default: return "phone-android";
  }
}

/**
 * Get display name for cloud provider
 */
export function getProviderName(provider: CloudProvider): string {
  switch (provider) {
    case "dropbox": return "Dropbox";
    case "google-drive": return "Google Drive";
    case "icloud": return "iCloud";
    case "onedrive": return "OneDrive";
    default: return "Gerät";
  }
}
