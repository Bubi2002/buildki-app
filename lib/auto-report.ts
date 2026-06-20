import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const AUTO_REPORT_SETTINGS_KEY = "auto_report_settings";
const AUTO_REPORT_LAST_RUN_KEY = "auto_report_last_run";

export type ReportFrequency = "daily" | "weekly" | "off";
export type ReportTime = { hour: number; minute: number };
export type ReportDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday, 1=Monday...

export type AutoReportSettings = {
  enabled: boolean;
  frequency: ReportFrequency;
  time: ReportTime;
  weekday: ReportDay; // For weekly reports
  projectIds: string[]; // Empty = all projects
  includePhotos: boolean;
  includeDefects: boolean;
  includeTodos: boolean;
  autoSendEmail: boolean;
  emailRecipient: string;
  autoUploadDropbox: boolean;
};

const DEFAULT_SETTINGS: AutoReportSettings = {
  enabled: false,
  frequency: "daily",
  time: { hour: 18, minute: 0 },
  weekday: 5, // Friday
  projectIds: [],
  includePhotos: true,
  includeDefects: true,
  includeTodos: true,
  autoSendEmail: false,
  emailRecipient: "",
  autoUploadDropbox: false,
};

/**
 * Get auto-report settings
 */
export async function getAutoReportSettings(): Promise<AutoReportSettings> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_REPORT_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save auto-report settings and schedule notifications
 */
export async function saveAutoReportSettings(settings: AutoReportSettings): Promise<void> {
  await AsyncStorage.setItem(AUTO_REPORT_SETTINGS_KEY, JSON.stringify(settings));
  await scheduleReportNotification(settings);
}

/**
 * Get last report run timestamp
 */
export async function getLastReportRun(): Promise<string | null> {
  return AsyncStorage.getItem(AUTO_REPORT_LAST_RUN_KEY);
}

/**
 * Set last report run timestamp
 */
export async function setLastReportRun(): Promise<void> {
  await AsyncStorage.setItem(AUTO_REPORT_LAST_RUN_KEY, new Date().toISOString());
}

/**
 * Schedule a local notification to remind user to generate the report
 * (Since background tasks are limited on mobile, we use notifications as triggers)
 */
export async function scheduleReportNotification(settings: AutoReportSettings): Promise<void> {
  if (Platform.OS === "web") return;

  // Cancel existing scheduled notifications for reports
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.type === "auto_report") {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  if (!settings.enabled || settings.frequency === "off") return;

  // Request permissions
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    if (newStatus !== "granted") return;
  }

  if (settings.frequency === "daily") {
    // Schedule daily notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Tagesbericht bereit",
        body: "Dein automatischer Gesamtbericht kann jetzt generiert werden. Tippe zum Erstellen.",
        data: { type: "auto_report", frequency: "daily" },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: settings.time.hour,
        minute: settings.time.minute,
      },
    });
  } else if (settings.frequency === "weekly") {
    // Schedule weekly notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Wochenbericht bereit",
        body: "Dein automatischer Wochenbericht kann jetzt generiert werden. Tippe zum Erstellen.",
        data: { type: "auto_report", frequency: "weekly" },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: settings.weekday + 1, // Expo uses 1-7 (Sunday=1)
        hour: settings.time.hour,
        minute: settings.time.minute,
      },
    });
  }
}

/**
 * Check if a report should be generated now (called on app open)
 */
export async function shouldGenerateReport(): Promise<{ should: boolean; frequency: ReportFrequency }> {
  const settings = await getAutoReportSettings();
  if (!settings.enabled || settings.frequency === "off") {
    return { should: false, frequency: "off" };
  }

  const lastRun = await getLastReportRun();
  const now = new Date();

  if (!lastRun) {
    return { should: true, frequency: settings.frequency };
  }

  const lastRunDate = new Date(lastRun);
  const hoursSinceLastRun = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);

  if (settings.frequency === "daily" && hoursSinceLastRun >= 20) {
    // Check if we're past the scheduled time today
    const scheduledToday = new Date(now);
    scheduledToday.setHours(settings.time.hour, settings.time.minute, 0, 0);
    if (now >= scheduledToday && lastRunDate < scheduledToday) {
      return { should: true, frequency: "daily" };
    }
  }

  if (settings.frequency === "weekly" && hoursSinceLastRun >= 144) {
    // 6 days minimum
    if (now.getDay() === settings.weekday) {
      const scheduledToday = new Date(now);
      scheduledToday.setHours(settings.time.hour, settings.time.minute, 0, 0);
      if (now >= scheduledToday && lastRunDate < scheduledToday) {
        return { should: true, frequency: "weekly" };
      }
    }
  }

  return { should: false, frequency: settings.frequency };
}

/**
 * Get the date range for the report based on frequency
 */
export function getReportDateRange(frequency: ReportFrequency): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();

  if (frequency === "daily") {
    start.setHours(0, 0, 0, 0);
  } else if (frequency === "weekly") {
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

/**
 * Format frequency for display
 */
export function formatFrequency(freq: ReportFrequency): string {
  switch (freq) {
    case "daily": return "Täglich";
    case "weekly": return "Wöchentlich";
    case "off": return "Aus";
  }
}

/**
 * Format weekday for display
 */
export function formatWeekday(day: ReportDay): string {
  const days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  return days[day];
}
