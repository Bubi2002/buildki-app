import AsyncStorage from "@react-native-async-storage/async-storage";

const EXPORT_HISTORY_KEY = "pdf-export-history";
const MAX_HISTORY_ENTRIES = 100;

export type PdfExportEntry = {
  id: string;
  timestamp: number;
  filename: string;
  protocolTitle: string;
  templateName: string;
  projectName: string;
  recipients: string[];
  ccRecipients: string[];
  method: "share" | "email" | "whatsapp" | "auto";
};

export async function getExportHistory(): Promise<PdfExportEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(EXPORT_HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn("[ExportHistory] Failed to load:", err);
  }
  return [];
}

export async function addExportEntry(entry: Omit<PdfExportEntry, "id" | "timestamp">): Promise<void> {
  try {
    const history = await getExportHistory();
    const newEntry: PdfExportEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    history.unshift(newEntry);
    // Keep only the last MAX_HISTORY_ENTRIES
    const trimmed = history.slice(0, MAX_HISTORY_ENTRIES);
    await AsyncStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn("[ExportHistory] Failed to save:", err);
  }
}

export async function clearExportHistory(): Promise<void> {
  await AsyncStorage.removeItem(EXPORT_HISTORY_KEY);
}
