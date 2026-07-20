import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Platform, Alert } from "react-native";

const BACKUP_KEYS = [
  "protocols",
  "projects",
  "settings",
  "company-settings",
  "custom-templates",
  "annotation-templates",
  "task-reminder-settings",
  "biometric-lock-enabled",
  "theme-mode",
  "onboarding-complete",
  "last-selected-project-id",
];

export type BackupData = {
  version: number;
  createdAt: string;
  appVersion: string;
  data: Record<string, string | null>;
};

export async function createBackup(): Promise<void> {
  try {
    const data: Record<string, string | null> = {};

    for (const key of BACKUP_KEYS) {
      data[key] = await AsyncStorage.getItem(key);
    }

    const backup: BackupData = {
      version: 1,
      createdAt: new Date().toISOString(),
      appVersion: "1.0.0",
      data,
    };

    const jsonContent = JSON.stringify(backup, null, 2);
    const fileName = `BuildKI_Backup_${new Date().toISOString().split("T")[0]}.json`;

    if (Platform.OS === "web") {
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      Alert.alert("Backup erstellt", "Die Datei wurde heruntergeladen.");
      return;
    }

    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, jsonContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: "Backup speichern",
        UTI: "public.json",
      });
    } else {
      Alert.alert("Fehler", "Teilen ist auf diesem Gerät nicht verfügbar.");
    }
  } catch (error) {
    console.error("Backup error:", error);
    Alert.alert("Fehler", "Backup konnte nicht erstellt werden.");
  }
}

export async function restoreBackup(): Promise<boolean> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return false;
    }

    const fileUri = result.assets[0].uri;
    let jsonContent: string;

    if (Platform.OS === "web") {
      const response = await fetch(fileUri);
      jsonContent = await response.text();
    } else {
      jsonContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    const backup: BackupData = JSON.parse(jsonContent);

    // Validate backup structure
    if (!backup.version || !backup.data || typeof backup.data !== "object") {
      Alert.alert("Ungültige Datei", "Die ausgewählte Datei ist kein gültiges BuildKI-Backup.");
      return false;
    }

    // Confirm restore
    return new Promise((resolve) => {
      Alert.alert(
        "Backup wiederherstellen?",
        `Backup vom ${new Date(backup.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}\n\nAlle aktuellen Daten werden überschrieben!`,
        [
          { text: "Abbrechen", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Wiederherstellen",
            style: "destructive",
            onPress: async () => {
              try {
                for (const [key, value] of Object.entries(backup.data)) {
                  if (value !== null && value !== undefined) {
                    await AsyncStorage.setItem(key, value);
                  } else {
                    await AsyncStorage.removeItem(key);
                  }
                }
                Alert.alert(
                  "Wiederhergestellt",
                  "Backup wurde erfolgreich wiederhergestellt. Bitte starte die App neu.",
                );
                resolve(true);
              } catch (err) {
                console.error("Restore error:", err);
                Alert.alert("Fehler", "Wiederherstellung fehlgeschlagen.");
                resolve(false);
              }
            },
          },
        ]
      );
    });
  } catch (error) {
    console.error("Restore error:", error);
    Alert.alert("Fehler", "Backup konnte nicht gelesen werden.");
    return false;
  }
}

export async function getBackupStats(): Promise<{ protocolCount: number; projectCount: number; totalSize: string }> {
  try {
    const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
    const projects = JSON.parse((await AsyncStorage.getItem("projects")) || "[]");

    // Estimate storage size
    let totalBytes = 0;
    for (const key of BACKUP_KEYS) {
      const val = await AsyncStorage.getItem(key);
      if (val) totalBytes += val.length * 2; // UTF-16
    }

    const totalSize = totalBytes > 1024 * 1024
      ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(totalBytes / 1024).toFixed(0)} KB`;

    return {
      protocolCount: protocols.length,
      projectCount: projects.length,
      totalSize,
    };
  } catch {
    return { protocolCount: 0, projectCount: 0, totalSize: "0 KB" };
  }
}
