import AsyncStorage from "@react-native-async-storage/async-storage";

const ANALYSIS_HISTORY_KEY = "analysis-history";
const MAX_HISTORY_ENTRIES = 50;

export type AnalysisHistoryEntry = {
  id: string;
  timestamp: string;
  source: string;
  projectId: string;
  projectName?: string;
  summary: string;
  defectCount: number;
  taskCount: number;
  progressPercent: number;
  adoptedDefects: number;
  adoptedTasks: number;
  photoCount: number;
  // Sprint 3: Extended filter fields
  roomName?: string;
  trade?: string;
  status?: "pending" | "reviewed" | "adopted" | "dismissed";
  avgConfidence?: number;
  imageUrls?: string[];
  defects?: { id: string; title: string; severity: string; trade: string; confidence: number }[];
  tasks?: { id: string; title: string; priority: string; trade: string }[];
  observations?: string[];
  progress?: { overallPercent: number; phase: string };
};

export async function getAnalysisHistory(): Promise<AnalysisHistoryEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(ANALYSIS_HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn("[AnalysisHistory] Failed to load:", err);
  }
  return [];
}

export async function saveAnalysisToHistory(entry: Omit<AnalysisHistoryEntry, "id">): Promise<void> {
  try {
    const history = await getAnalysisHistory();
    const newEntry: AnalysisHistoryEntry = {
      ...entry,
      id: `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
    history.unshift(newEntry);
    const trimmed = history.slice(0, MAX_HISTORY_ENTRIES);
    await AsyncStorage.setItem(ANALYSIS_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn("[AnalysisHistory] Failed to save:", err);
  }
}

export async function clearAnalysisHistory(): Promise<void> {
  await AsyncStorage.removeItem(ANALYSIS_HISTORY_KEY);
}
