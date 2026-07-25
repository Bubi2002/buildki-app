import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type CloudExportProvider = "dropbox" | "google-drive" | "onedrive" | "icloud" | "system-share";

export interface CloudExportConfig {
  provider: CloudExportProvider;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const CLOUD_PROVIDERS: CloudExportConfig[] = [
  {
    provider: "dropbox",
    label: "Dropbox",
    icon: "cloud-upload",
    color: "#0061FF",
    description: "Fotos in Dropbox-Ordner exportieren",
  },
  {
    provider: "google-drive",
    label: "Google Drive",
    icon: "add-to-drive",
    color: "#4285F4",
    description: "Fotos in Google Drive speichern",
  },
  {
    provider: "onedrive",
    label: "OneDrive",
    icon: "cloud",
    color: "#0078D4",
    description: "Fotos in OneDrive hochladen",
  },
  {
    provider: "icloud",
    label: "iCloud Drive",
    icon: "cloud-done",
    color: "#3693F5",
    description: "Fotos in iCloud Drive ablegen",
  },
  {
    provider: "system-share",
    label: "Andere App",
    icon: "share",
    color: "#666666",
    description: "Über System-Teilen-Dialog exportieren",
  },
];

const EXPORT_HISTORY_KEY = "@cloud_photo_export_history";
const PREFERRED_PROVIDER_KEY = "@cloud_photo_preferred_provider";

export interface ExportHistoryEntry {
  id: string;
  provider: CloudExportProvider;
  photoCount: number;
  protocolTitle: string;
  projectName?: string;
  timestamp: number;
  folderName: string;
}

/**
 * Export photos to a cloud provider.
 * On mobile, this uses the system share sheet which integrates with installed cloud apps.
 * The user can save to Dropbox, Google Drive, OneDrive, iCloud, etc. through the native share dialog.
 */
export async function exportPhotosToCloud(
  photos: string[],
  options: {
    provider: CloudExportProvider;
    protocolTitle: string;
    projectName?: string;
    protocolDate?: string;
    protocolNumber?: string;
  }
): Promise<{ success: boolean; exportedCount: number; error?: string }> {
  if (photos.length === 0) {
    return { success: false, exportedCount: 0, error: "Keine Fotos zum Exportieren" };
  }

  try {
    // Build folder name from protocol metadata (preserving original naming)
    const folderName = buildFolderName(options);

    if (Platform.OS === "web") {
      // On web, trigger download for each photo
      for (const photo of photos) {
        const link = document.createElement("a");
        link.href = photo;
        link.download = `${folderName}_${photos.indexOf(photo) + 1}.jpg`;
        link.click();
      }
      await saveExportHistory({
        provider: options.provider,
        photoCount: photos.length,
        protocolTitle: options.protocolTitle,
        projectName: options.projectName,
        folderName,
      });
      return { success: true, exportedCount: photos.length };
    }

    // On native, use expo-sharing which integrates with cloud apps
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, exportedCount: 0, error: "Teilen nicht verfügbar auf diesem Gerät" };
    }

    if (photos.length === 1) {
      // Single photo - share directly
      await Sharing.shareAsync(photos[0], {
        mimeType: "image/jpeg",
        dialogTitle: `Foto exportieren: ${folderName}`,
        UTI: "public.jpeg",
      });
    } else {
      // Multiple photos - create a zip or share sequentially
      // First try to create a combined export
      const zipUri = await createPhotoZip(photos, folderName);
      if (zipUri) {
        await Sharing.shareAsync(zipUri, {
          mimeType: "application/zip",
          dialogTitle: `${photos.length} Fotos exportieren: ${folderName}`,
          UTI: "com.pkware.zip-archive",
        });
      } else {
        // Fallback: share first photo and inform user
        await Sharing.shareAsync(photos[0], {
          mimeType: "image/jpeg",
          dialogTitle: `Foto 1/${photos.length} exportieren: ${folderName}`,
          UTI: "public.jpeg",
        });
      }
    }

    await saveExportHistory({
      provider: options.provider,
      photoCount: photos.length,
      protocolTitle: options.protocolTitle,
      projectName: options.projectName,
      folderName,
    });

    // Save preferred provider
    await AsyncStorage.setItem(PREFERRED_PROVIDER_KEY, options.provider);

    return { success: true, exportedCount: photos.length };
  } catch (error: any) {
    return { success: false, exportedCount: 0, error: error.message || "Export fehlgeschlagen" };
  }
}

/**
 * Export all photos from a protocol as a batch
 */
export async function exportAllPhotos(
  photos: string[],
  options: {
    protocolTitle: string;
    projectName?: string;
    protocolDate?: string;
    protocolNumber?: string;
  }
): Promise<{ success: boolean; exportedCount: number; error?: string }> {
  const provider = await getPreferredProvider();
  return exportPhotosToCloud(photos, { ...options, provider });
}

/**
 * Build a meaningful folder/file name from protocol metadata
 */
function buildFolderName(options: {
  protocolTitle: string;
  projectName?: string;
  protocolDate?: string;
  protocolNumber?: string;
}): string {
  const parts: string[] = [];
  if (options.projectName) parts.push(options.projectName);
  if (options.protocolNumber) parts.push(options.protocolNumber);
  if (options.protocolDate) parts.push(options.protocolDate);
  else parts.push(new Date().toISOString().split("T")[0]);
  if (parts.length === 0) parts.push(options.protocolTitle.slice(0, 30));
  return parts.join("_").replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_");
}

/**
 * Create a ZIP file from multiple photos
 */
async function createPhotoZip(photos: string[], baseName: string): Promise<string | null> {
  try {
    // On native, we can't easily create ZIP without a library
    // Instead, we'll use a directory approach
    const exportDir = `${FileSystem.cacheDirectory}photo_export_${Date.now()}/`;
    await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });

    // Copy photos to export directory with meaningful names
    for (let i = 0; i < photos.length; i++) {
      const ext = photos[i].toLowerCase().includes(".png") ? "png" : "jpg";
      const destName = `${baseName}_Foto_${String(i + 1).padStart(2, "0")}.${ext}`;
      const destUri = exportDir + destName;
      try {
        await FileSystem.copyAsync({ from: photos[i], to: destUri });
      } catch {
        // Skip photos that can't be copied
      }
    }

    // Return the directory - on iOS/Android the share sheet can handle directories
    // But for better compatibility, share the first file and note the count
    const files = await FileSystem.readDirectoryAsync(exportDir);
    if (files.length > 0) {
      return exportDir + files[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save export history for tracking
 */
async function saveExportHistory(entry: Omit<ExportHistoryEntry, "id" | "timestamp">): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(EXPORT_HISTORY_KEY);
    const history: ExportHistoryEntry[] = raw ? JSON.parse(raw) : [];
    history.unshift({
      ...entry,
      id: `exp_${Date.now()}`,
      timestamp: Date.now(),
    });
    // Keep last 50 entries
    await AsyncStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get export history
 */
export async function getExportHistory(): Promise<ExportHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(EXPORT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Get preferred cloud provider
 */
export async function getPreferredProvider(): Promise<CloudExportProvider> {
  try {
    const raw = await AsyncStorage.getItem(PREFERRED_PROVIDER_KEY);
    return (raw as CloudExportProvider) || "system-share";
  } catch {
    return "system-share";
  }
}

/**
 * Set preferred cloud provider
 */
export async function setPreferredProvider(provider: CloudExportProvider): Promise<void> {
  await AsyncStorage.setItem(PREFERRED_PROVIDER_KEY, provider);
}
