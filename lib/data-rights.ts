import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";
import { clearUserInfo, removeSessionToken } from "@/lib/_core/auth";
import { cancelDailySummary } from "@/lib/daily-summary";
import { disconnectDropbox } from "@/lib/dropbox-integration";
import { clearSession, secureDelete } from "@/lib/security";

const EXPORT_VERSION = 2;
const SECRET_KEY_PATTERN = /(password|passwort|token|secret|session|verification|reset[_-]?code|oauth)/i;

export type LocalFileManifestEntry = {
  path: string;
  size: number | null;
  modifiedAt: number | null;
  isDirectory: boolean;
};

export type BuildKiDataExport = {
  format: "buildki-data-export";
  version: number;
  exportedAt: string;
  scope: "local-and-account";
  local: {
    asyncStorage: Record<string, string | null>;
    excludedStorageKeys: string[];
    files: LocalFileManifestEntry[];
  };
  account: unknown;
  limitations: string[];
};

function isExportableStorageKey(key: string): boolean {
  return !SECRET_KEY_PATTERN.test(key);
}

async function inventoryDirectory(
  root: string | null,
  relativePath = "",
): Promise<LocalFileManifestEntry[]> {
  if (!root) return [];
  const directoryUri = `${root}${relativePath}`;
  const info = await FileSystem.getInfoAsync(directoryUri);
  if (!info.exists || !info.isDirectory) return [];

  const entries: LocalFileManifestEntry[] = [];
  const names = await FileSystem.readDirectoryAsync(directoryUri);
  for (const name of names) {
    const childRelativePath = relativePath ? `${relativePath}/${name}` : name;
    const childUri = `${root}${childRelativePath}`;
    const childInfo = await FileSystem.getInfoAsync(childUri);
    entries.push({
      path: childRelativePath,
      size: childInfo.exists && !childInfo.isDirectory && "size" in childInfo
        ? childInfo.size ?? null
        : null,
      modifiedAt: childInfo.exists && "modificationTime" in childInfo
        ? childInfo.modificationTime ?? null
        : null,
      isDirectory: Boolean(childInfo.exists && childInfo.isDirectory),
    });
    if (childInfo.exists && childInfo.isDirectory) {
      entries.push(...(await inventoryDirectory(root, `${childRelativePath}/`)));
    }
  }
  return entries;
}

export async function collectLocalDataExport(): Promise<BuildKiDataExport["local"]> {
  const allKeys = await AsyncStorage.getAllKeys();
  const exportableKeys = allKeys.filter(isExportableStorageKey).sort();
  const excludedStorageKeys = allKeys.filter((key) => !isExportableStorageKey(key)).sort();
  const pairs = await AsyncStorage.multiGet(exportableKeys);
  const asyncStorage = Object.fromEntries(pairs);
  const files = Platform.OS === "web"
    ? []
    : await inventoryDirectory(FileSystem.documentDirectory);

  return { asyncStorage, excludedStorageKeys, files };
}

export async function createCombinedDataExport(accountData: unknown): Promise<string> {
  const local = await collectLocalDataExport();
  const payload: BuildKiDataExport = {
    format: "buildki-data-export",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scope: "local-and-account",
    local,
    account: accountData,
    limitations: [
      "Lokale Mediendateien werden aus Sicherheits- und Speichergründen als vollständiges Dateimanifest mit Pfad, Größe und Änderungszeit ausgewiesen; Binärinhalte sind nicht in die JSON-Datei eingebettet.",
      "Nicht exportiert werden Passwörter, Passwort-Hashes, Sitzungstoken, OAuth-/Reset-/Verifikationsgeheimnisse und andere Zugangsschlüssel.",
      "Physische Löschfristen und Exportmöglichkeiten externer Anbieter sind OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN.",
    ],
  };

  return JSON.stringify(payload, null, 2);
}

export async function shareCombinedDataExport(accountData: unknown): Promise<void> {
  const content = await createCombinedDataExport(accountData);
  const fileName = `BuildKI_Datenauskunft_${new Date().toISOString().slice(0, 10)}.json`;

  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Teilen ist auf diesem Gerät nicht verfügbar.");
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: "application/json",
    dialogTitle: "BuildKI-Datenauskunft speichern",
    UTI: "public.json",
  });
}

async function clearDirectory(root: string | null): Promise<number> {
  if (!root) return 0;
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists || !info.isDirectory) return 0;
  const names = await FileSystem.readDirectoryAsync(root);
  let deleted = 0;
  for (const name of names) {
    await FileSystem.deleteAsync(`${root}${name}`, { idempotent: true });
    deleted += 1;
  }
  return deleted;
}

export async function deleteAllLocalUserData(): Promise<{
  removedStorageKeys: number;
  removedDocumentEntries: number;
  removedCacheEntries: number;
}> {
  const storageKeys = await AsyncStorage.getAllKeys();

  await Promise.allSettled([
    cancelDailySummary(),
    disconnectDropbox(),
    removeSessionToken(),
    clearUserInfo(),
    clearSession(),
    secureDelete("buildki_2fa_config"),
  ]);

  if (Platform.OS !== "web") {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_INFO_KEY),
      SecureStore.deleteItemAsync("dropbox_tokens"),
      SecureStore.deleteItemAsync("matterport_credentials"),
    ]);
  } else if (typeof window !== "undefined") {
    window.localStorage.removeItem(USER_INFO_KEY);
  }

  const [removedDocumentEntries, removedCacheEntries] = await Promise.all([
    Platform.OS === "web" ? 0 : clearDirectory(FileSystem.documentDirectory),
    Platform.OS === "web" ? 0 : clearDirectory(FileSystem.cacheDirectory),
  ]);
  await AsyncStorage.clear();

  return {
    removedStorageKeys: storageKeys.length,
    removedDocumentEntries,
    removedCacheEntries,
  };
}
