/**
 * Daily Summary / Push Notification
 * 
 * Generates a daily summary of activities and sends it as a push notification.
 * Also handles Mängel deadline reminders.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { getDefects, type Defect } from "./defect-store";

const DAILY_SUMMARY_SETTINGS_KEY = "daily-summary-settings";
const LAST_SUMMARY_KEY = "last-daily-summary";

export type DailySummarySettings = {
  enabled: boolean;
  time: string; // HH:MM format, e.g. "18:00"
  includeProtocols: boolean;
  includeDefects: boolean;
  includeTasks: boolean;
  defectDeadlineReminder: boolean; // Remind about upcoming deadlines
  defectDeadlineDays: number; // Days before deadline to remind (default: 2)
};

export const DEFAULT_SUMMARY_SETTINGS: DailySummarySettings = {
  enabled: true,
  time: "18:00",
  includeProtocols: true,
  includeDefects: true,
  includeTasks: true,
  defectDeadlineReminder: true,
  defectDeadlineDays: 2,
};

/**
 * Get daily summary settings
 */
export async function getDailySummarySettings(): Promise<DailySummarySettings> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_SUMMARY_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SUMMARY_SETTINGS, ...JSON.parse(raw) };
    return DEFAULT_SUMMARY_SETTINGS;
  } catch {
    return DEFAULT_SUMMARY_SETTINGS;
  }
}

/**
 * Save daily summary settings
 */
export async function saveDailySummarySettings(settings: Partial<DailySummarySettings>): Promise<void> {
  const current = await getDailySummarySettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(DAILY_SUMMARY_SETTINGS_KEY, JSON.stringify(updated));
  
  // Reschedule notifications
  if (updated.enabled) {
    await scheduleDailySummary(updated);
  } else {
    await cancelDailySummary();
  }
}

/**
 * Schedule the daily summary notification
 */
export async function scheduleDailySummary(settings?: DailySummarySettings): Promise<void> {
  const s = settings || await getDailySummarySettings();
  if (!s.enabled) return;

  // Cancel existing
  await cancelDailySummary();

  const [hours, minutes] = s.time.split(":").map(Number);

  // Schedule daily repeating notification
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "ProtoKI – Tages-Zusammenfassung",
      body: "Tippe hier, um deine Tagesübersicht zu sehen.",
      data: { type: "daily_summary" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
    },
  });
}

/**
 * Cancel the daily summary notification
 */
export async function cancelDailySummary(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if ((notif.content.data as any)?.type === "daily_summary") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

/**
 * Check for defects with upcoming deadlines and send reminders
 */
export async function checkDefectDeadlines(): Promise<void> {
  const settings = await getDailySummarySettings();
  if (!settings.defectDeadlineReminder) return;

  const allDefects = await getDefects();
  const now = new Date();
  const reminderDate = new Date(now.getTime() + settings.defectDeadlineDays * 86400000);

  const upcomingDeadlines = allDefects.filter(d => {
    if (d.status === "erledigt") return false;
    if (!d.dueDate) return false;
    const due = new Date(d.dueDate);
    return due <= reminderDate && due >= now;
  });

  const overdueDefects = allDefects.filter(d => {
    if (d.status === "erledigt") return false;
    if (!d.dueDate) return false;
    return new Date(d.dueDate) < now;
  });

  if (overdueDefects.length > 0) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚠️ ${overdueDefects.length} überfällige Mängel`,
        body: overdueDefects.slice(0, 3).map(d => d.title).join(", ") + 
          (overdueDefects.length > 3 ? ` und ${overdueDefects.length - 3} weitere` : ""),
        data: { type: "defect_overdue" },
      },
      trigger: null, // Immediate
    });
  }

  if (upcomingDeadlines.length > 0) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📋 ${upcomingDeadlines.length} Mängel-Fristen in ${settings.defectDeadlineDays} Tagen`,
        body: upcomingDeadlines.slice(0, 3).map(d => d.title).join(", ") + 
          (upcomingDeadlines.length > 3 ? ` und ${upcomingDeadlines.length - 3} weitere` : ""),
        data: { type: "defect_deadline" },
      },
      trigger: null, // Immediate
    });
  }
}

/**
 * Generate the daily summary text
 */
export async function generateDailySummaryText(projectId?: string): Promise<{
  title: string;
  body: string;
  stats: {
    protocolsToday: number;
    openDefects: number;
    overdueDefects: number;
    completedTasks: number;
  };
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get defects
  const defects = projectId ? await getDefects(projectId) : await getDefects();
  const openDefects = defects.filter(d => d.status !== "erledigt");
  const overdueDefects = defects.filter(d => {
    if (d.status === "erledigt" || !d.dueDate) return false;
    return new Date(d.dueDate) < new Date();
  });

  // Get protocols created today (from AsyncStorage)
  let protocolsToday = 0;
  try {
    const raw = await AsyncStorage.getItem("protocols");
    const protocols = raw ? JSON.parse(raw) : [];
    protocolsToday = protocols.filter((p: any) => {
      const created = new Date(p.createdAt);
      return created >= today;
    }).length;
  } catch {}

  // Get completed tasks today
  let completedTasks = 0;
  try {
    const raw = await AsyncStorage.getItem("protocols");
    const protocols = raw ? JSON.parse(raw) : [];
    for (const p of protocols) {
      if (p.todos) {
        completedTasks += p.todos.filter((t: any) => t.done).length;
      }
    }
  } catch {}

  const dateStr = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });

  const parts: string[] = [];
  if (protocolsToday > 0) parts.push(`${protocolsToday} Protokoll${protocolsToday > 1 ? "e" : ""} erstellt`);
  if (openDefects.length > 0) parts.push(`${openDefects.length} offene Mängel`);
  if (overdueDefects.length > 0) parts.push(`${overdueDefects.length} überfällig`);
  if (completedTasks > 0) parts.push(`${completedTasks} Aufgaben erledigt`);

  return {
    title: `Tagesübersicht – ${dateStr}`,
    body: parts.length > 0 ? parts.join(" | ") : "Keine Aktivitäten heute.",
    stats: {
      protocolsToday,
      openDefects: openDefects.length,
      overdueDefects: overdueDefects.length,
      completedTasks,
    },
  };
}

/**
 * Initialize daily summary on app start
 */
export async function initDailySummary(): Promise<void> {
  const settings = await getDailySummarySettings();
  if (settings.enabled) {
    await scheduleDailySummary(settings);
  }
  // Check deadlines on every app start
  await checkDefectDeadlines();
}
