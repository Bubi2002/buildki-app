import AsyncStorage from "@react-native-async-storage/async-storage";

const TIME_ENTRIES_KEY = "time-entries";
const ACTIVE_TIMER_KEY = "active-timer";
const TIME_TRACKING_SETTINGS_KEY = "time-tracking-settings";

export type TimeTrackingSettings = {
  workerName: string;
  companyName: string;
  hourlyRate: string; // stored as string for easy input handling
  dailyRate: string;
};

const DEFAULT_TIME_TRACKING_SETTINGS: TimeTrackingSettings = {
  workerName: "",
  companyName: "",
  hourlyRate: "",
  dailyRate: "",
};

export async function getTimeTrackingSettings(): Promise<TimeTrackingSettings> {
  try {
    const stored = await AsyncStorage.getItem(TIME_TRACKING_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_TIME_TRACKING_SETTINGS, ...JSON.parse(stored) };
    }
    return DEFAULT_TIME_TRACKING_SETTINGS;
  } catch {
    return DEFAULT_TIME_TRACKING_SETTINGS;
  }
}

export async function saveTimeTrackingSettings(settings: TimeTrackingSettings): Promise<void> {
  await AsyncStorage.setItem(TIME_TRACKING_SETTINGS_KEY, JSON.stringify(settings));
}

export type TimeEntry = {
  id: string;
  projectId: string;
  projectName: string;
  startTime: string; // ISO
  endTime: string | null; // ISO, null if still running
  duration: number; // seconds
  note: string;
  category: "arbeit" | "pause" | "fahrt" | "besprechung";
};

export type ActiveTimer = {
  projectId: string;
  projectName: string;
  startTime: string;
  category: TimeEntry["category"];
  note: string;
} | null;

export async function getActiveTimer(): Promise<ActiveTimer> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_TIMER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export async function startTimer(projectId: string, projectName: string, category: TimeEntry["category"] = "arbeit", note: string = ""): Promise<void> {
  const timer: ActiveTimer = {
    projectId,
    projectName,
    startTime: new Date().toISOString(),
    category,
    note,
  };
  await AsyncStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(timer));
}

export async function stopTimer(): Promise<TimeEntry | null> {
  try {
    const timer = await getActiveTimer();
    if (!timer) return null;

    const endTime = new Date().toISOString();
    const duration = Math.floor((new Date(endTime).getTime() - new Date(timer.startTime).getTime()) / 1000);

    const entry: TimeEntry = {
      id: `time_${Date.now()}`,
      projectId: timer.projectId,
      projectName: timer.projectName,
      startTime: timer.startTime,
      endTime,
      duration,
      note: timer.note,
      category: timer.category,
    };

    // Save entry
    const stored = await AsyncStorage.getItem(TIME_ENTRIES_KEY);
    const entries: TimeEntry[] = stored ? JSON.parse(stored) : [];
    entries.push(entry);
    await AsyncStorage.setItem(TIME_ENTRIES_KEY, JSON.stringify(entries));

    // Clear active timer
    await AsyncStorage.removeItem(ACTIVE_TIMER_KEY);

    return entry;
  } catch {
    return null;
  }
}

export async function getTimeEntries(projectId?: string): Promise<TimeEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(TIME_ENTRIES_KEY);
    const entries: TimeEntry[] = stored ? JSON.parse(stored) : [];
    const filtered = projectId ? entries.filter((e) => e.projectId === projectId) : entries;
    return filtered.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  } catch {
    return [];
  }
}

export async function deleteTimeEntry(id: string): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(TIME_ENTRIES_KEY);
    const entries: TimeEntry[] = stored ? JSON.parse(stored) : [];
    const filtered = entries.filter((e) => e.id !== id);
    await AsyncStorage.setItem(TIME_ENTRIES_KEY, JSON.stringify(filtered));
  } catch {}
}

export async function getTodayTotal(projectId?: string): Promise<number> {
  const entries = await getTimeEntries(projectId);
  const today = new Date().toDateString();
  return entries
    .filter((e) => new Date(e.startTime).toDateString() === today)
    .reduce((sum, e) => sum + e.duration, 0);
}

export async function getWeekTotal(projectId?: string): Promise<number> {
  const entries = await getTimeEntries(projectId);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday of this week (Sunday-safe)
  weekStart.setHours(0, 0, 0, 0);
  return entries
    .filter((e) => new Date(e.startTime) >= weekStart)
    .reduce((sum, e) => sum + e.duration, 0);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatDurationShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export { DEFAULT_TIME_TRACKING_SETTINGS };
