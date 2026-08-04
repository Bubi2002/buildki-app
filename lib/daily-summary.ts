/**
 * Daily Summary / Push Notification
 * 
 * Generates a daily summary of activities and sends it as a push notification.
 * Also handles Mängel deadline reminders.
 * Supports custom time (hour + minute) and weekday selection.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { getDefects } from "./defect-store";

const DAILY_SUMMARY_SETTINGS_KEY = "daily-summary-settings";
const LAST_SUMMARY_KEY = "last-daily-summary";

export type DailySummarySettings = {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
  time: string; // HH:MM format for backward compat
  weekdays: number[]; // 1=Sunday, 2=Monday, ..., 7=Saturday (expo-notifications convention)
  includeProtocols: boolean;
  includeDefects: boolean;
  includeTasks: boolean;
  defectDeadlineReminder: boolean;
  defectDeadlineDays: number;
};

export const DEFAULT_SUMMARY_SETTINGS: DailySummarySettings = {
  enabled: false,
  hour: 18,
  minute: 0,
  time: "18:00",
  weekdays: [2, 3, 4, 5, 6], // Mo-Fr (2=Monday ... 6=Friday in expo convention)
  includeProtocols: true,
  includeDefects: true,
  includeTasks: true,
  defectDeadlineReminder: false,
  defectDeadlineDays: 2,
};

/**
 * Get daily summary settings
 */
export async function getDailySummarySettings(): Promise<DailySummarySettings> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_SUMMARY_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old format: if only "time" string exists, parse into hour/minute
      if (parsed.time && parsed.hour === undefined) {
        const [h, m] = parsed.time.split(":").map(Number);
        parsed.hour = h;
        parsed.minute = m;
      }
      // Migrate: if no weekdays, default to every day
      if (!parsed.weekdays) {
        parsed.weekdays = [1, 2, 3, 4, 5, 6, 7];
      }
      return { ...DEFAULT_SUMMARY_SETTINGS, ...parsed };
    }
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
  // Keep time string in sync
  updated.time = `${String(updated.hour).padStart(2, "0")}:${String(updated.minute).padStart(2, "0")}`;
  await AsyncStorage.setItem(DAILY_SUMMARY_SETTINGS_KEY, JSON.stringify(updated));
  
  // Reschedule notifications
  if (updated.enabled) {
    await scheduleDailySummary(updated);
  } else {
    await cancelDailySummary();
  }
}

/**
 * Schedule the daily summary notification.
 * If weekdays are selected, schedules one WEEKLY trigger per weekday.
 * If all 7 days are selected, uses a single DAILY trigger instead.
 */
export async function scheduleDailySummary(settings?: DailySummarySettings): Promise<void> {
  const s = settings || await getDailySummarySettings();
  if (!s.enabled) return;

  // Cancel existing
  await cancelDailySummary();

  const { hour, minute, weekdays } = s;

  // If all 7 days selected, use DAILY trigger (more efficient)
  if (weekdays.length === 7 || weekdays.length === 0) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "BuildKI \u2013 Tages-Zusammenfassung",
        body: "Tippe hier, um deine Tages\u00fcbersicht zu sehen.",
        data: { type: "daily_summary" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } else {
    // Schedule one WEEKLY trigger per selected weekday
    for (const weekday of weekdays) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "BuildKI \u2013 Tages-Zusammenfassung",
          body: "Tippe hier, um deine Tages\u00fcbersicht zu sehen.",
          data: { type: "daily_summary" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
        },
      });
    }
  }
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
    if (d.status === "erledigt" || d.status === "geschlossen" || d.status === "abgelehnt") return false;
    if (!d.dueDate) return false;
    const due = new Date(d.dueDate);
    return due <= reminderDate && due >= now;
  });

  const overdueDefects = allDefects.filter(d => {
    if (d.status === "erledigt" || d.status === "geschlossen" || d.status === "abgelehnt") return false;
    if (!d.dueDate) return false;
    return new Date(d.dueDate) < now;
  });

  if (overdueDefects.length > 0) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `\u26a0\ufe0f ${overdueDefects.length} \u00fcberf\u00e4llige M\u00e4ngel`,
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
        title: `\ud83d\udccb ${upcomingDeadlines.length} M\u00e4ngel-Fristen in ${settings.defectDeadlineDays} Tagen`,
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
  const openDefects = defects.filter(d => d.status !== "erledigt" && d.status !== "geschlossen" && d.status !== "abgelehnt");
  const overdueDefects = defects.filter(d => {
    if (d.status === "erledigt" || d.status === "geschlossen" || d.status === "abgelehnt" || !d.dueDate) return false;
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
  if (openDefects.length > 0) parts.push(`${openDefects.length} offene M\u00e4ngel`);
  if (overdueDefects.length > 0) parts.push(`${overdueDefects.length} \u00fcberf\u00e4llig`);
  if (completedTasks > 0) parts.push(`${completedTasks} Aufgaben erledigt`);

  return {
    title: `Tages\u00fcbersicht \u2013 ${dateStr}`,
    body: parts.length > 0 ? parts.join(" | ") : "Keine Aktivit\u00e4ten heute.",
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
  if (!settings.enabled && !settings.defectDeadlineReminder) return;
  if (settings.enabled) {
    await scheduleDailySummary(settings);
  }
  if (settings.defectDeadlineReminder) {
    await checkDefectDeadlines();
  }
}
