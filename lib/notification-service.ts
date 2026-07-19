import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationPreferences = {
  enabled: boolean;
  openDefectsReminder: boolean;
  checklistReminder: boolean;
  dailyDigest: boolean;
  followUpReminder: boolean;
  reminderHour: number; // 0-23
  reminderMinute: number; // 0-59
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  openDefectsReminder: true,
  checklistReminder: true,
  dailyDigest: true,
  followUpReminder: true,
  reminderHour: 8,
  reminderMinute: 0,
};

const PREFS_KEY = "notification_preferences";
const FOLLOWUP_NOTIFICATIONS_KEY = "followup_scheduled_notifications";

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const data = await AsyncStorage.getItem(PREFS_KEY);
    if (data) return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) };
    return DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  await scheduleNotifications();
}

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === "granted";
}

export async function scheduleNotifications(): Promise<void> {
  if (Platform.OS === "web") return;

  // Cancel all existing scheduled notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  const prefs = await getNotificationPreferences();
  if (!prefs.enabled) return;

  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  // Schedule daily check for open defects
  if (prefs.openDefectsReminder) {
    await scheduleDefectReminder(prefs);
  }

  // Schedule daily check for incomplete checklists
  if (prefs.checklistReminder) {
    await scheduleChecklistReminder(prefs);
  }

  // Schedule daily digest
  if (prefs.dailyDigest) {
    await scheduleDailyDigest(prefs);
  }

  // Schedule follow-up inspection reminders
  if (prefs.followUpReminder) {
    await scheduleFollowUpReminders();
  }

  // Schedule deadline-specific reminders
  await scheduleDeadlineReminders(prefs);
}

async function scheduleDefectReminder(prefs: NotificationPreferences): Promise<void> {
  try {
    // Use getDefects from defect-store (Single Source of Truth)
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects();
    const openDefects = defects.filter((d) =>
      d.status === "offen" || d.status === "zugewiesen" || d.status === "in_bearbeitung" || d.status === "nachbesserung"
    );

    if (openDefects.length > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Offene Mängel",
          body: `Du hast ${openDefects.length} offene ${openDefects.length === 1 ? "Mangel" : "Mängel"} zu bearbeiten.`,
          data: { type: "defects" },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: prefs.reminderHour,
          minute: prefs.reminderMinute,
        },
      });
    }
  } catch {}
}

/**
 * Schedule reminders for defects with upcoming or overdue deadlines (dueDate).
 */
async function scheduleDeadlineReminders(prefs: NotificationPreferences): Promise<void> {
  try {
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects();
    const now = new Date();

    for (const defect of defects) {
      if (!defect.dueDate || defect.status === "erledigt" || defect.status === "geschlossen") continue;
      const due = new Date(defect.dueDate);
      const diffMs = due.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Overdue: notify immediately
      if (diffDays < 0) {
        const triggerDate = new Date();
        triggerDate.setHours(prefs.reminderHour, prefs.reminderMinute + 10, 0, 0);
        if (triggerDate.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "\u26a0\ufe0f Frist \u00fcberschritten",
              body: `"${defect.title}" - Frist war am ${due.toLocaleDateString("de-DE")}`,
              data: { type: "overdue_deadline", defectId: defect.id },
              sound: true,
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: prefs.reminderHour, minute: prefs.reminderMinute + 10 },
          });
        }
        break; // Only one overdue notification per schedule cycle
      }

      // Due today
      if (diffDays === 0) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "\u23f0 Frist heute",
            body: `"${defect.title}" muss heute erledigt werden!`,
            data: { type: "deadline_today", defectId: defect.id },
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: prefs.reminderHour, minute: prefs.reminderMinute + 2 },
        });
        break;
      }

      // Due in 1-3 days
      if (diffDays >= 1 && diffDays <= 3) {
        const triggerDate = new Date(defect.dueDate);
        triggerDate.setDate(triggerDate.getDate() - 1);
        triggerDate.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
        if (triggerDate.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `\ud83d\udcc5 Frist in ${diffDays} ${diffDays === 1 ? "Tag" : "Tagen"}`,
              body: `"${defect.title}" - Frist: ${due.toLocaleDateString("de-DE")}`,
              data: { type: "deadline_upcoming", defectId: defect.id },
              sound: true,
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
          });
        }
        break;
      }
    }
  } catch {}
}

async function scheduleChecklistReminder(prefs: NotificationPreferences): Promise<void> {
  try {
    const checklistsData = await AsyncStorage.getItem("checklists_progress");
    const progress = JSON.parse(checklistsData || "{}");

    let incompleteCount = 0;
    Object.values(progress).forEach((items: any) => {
      if (Array.isArray(items)) {
        incompleteCount += items.filter((item: any) => !item.checked).length;
      }
    });

    if (incompleteCount > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Checklisten-Erinnerung",
          body: `${incompleteCount} offene ${incompleteCount === 1 ? "Punkt" : "Punkte"} in deinen Checklisten.`,
          data: { type: "checklists" },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: prefs.reminderHour,
          minute: prefs.reminderMinute + 5,
        },
      });
    }
  } catch {}
}

async function scheduleDailyDigest(prefs: NotificationPreferences): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Tägliche Zusammenfassung",
        body: "Starte deinen Tag: Überprüfe offene Aufgaben und erstelle neue Protokolle.",
        data: { type: "digest" },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: prefs.reminderHour,
        minute: prefs.reminderMinute,
      },
    });
  } catch {}
}

/**
 * Schedule follow-up inspection reminders for defects with followUpDate.
 * Schedules a notification for the morning of the follow-up date and one day before.
 */
async function scheduleFollowUpReminders(): Promise<void> {
  try {
    // Use getDefects from defect-store (Single Source of Truth)
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects();
    const prefs = await getNotificationPreferences();

    const now = new Date();
    const maxFutureDays = 30; // Only schedule up to 30 days ahead (Expo limit)

    const defectsWithFollowUp = defects.filter((d: any) =>
      d.followUpDate &&
      d.status !== "erledigt" &&
      d.status !== "geschlossen"
    );

    for (const defect of defectsWithFollowUp) {
      const followUpDate = new Date(defect.followUpDate!);
      const diffMs = followUpDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Schedule for the day of the follow-up
      if (diffDays >= 0 && diffDays <= maxFutureDays) {
        const triggerDate = new Date(defect.followUpDate!);
        triggerDate.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);

        if (triggerDate.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "🔍 Nachprüfung heute",
              body: `Nachprüfung fällig: ${defect.title}${defect.location ? ` (${defect.location})` : ""}`,
              data: { type: "followup", defectId: defect.id },
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: triggerDate,
            },
          });
        }
      }

      // Schedule reminder one day before
      if (diffDays >= 1 && diffDays <= maxFutureDays) {
        const dayBefore = new Date(defect.followUpDate!);
        dayBefore.setDate(dayBefore.getDate() - 1);
        dayBefore.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);

        if (dayBefore.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "📋 Nachprüfung morgen",
              body: `Morgen: Nachprüfung für "${defect.title}"${defect.assignee ? ` (${defect.assignee})` : ""}`,
              data: { type: "followup_reminder", defectId: defect.id },
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: dayBefore,
            },
          });
        }
      }
    }
  } catch {}
}

/**
 * Schedule a specific follow-up notification for a single defect.
 * Called when user sets a follow-up date on a defect.
 */
export async function scheduleFollowUpForDefect(defectId: string, defectTitle: string, followUpDate: string, location?: string): Promise<void> {
  if (Platform.OS === "web") return;

  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.followUpReminder) return;

  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  const now = new Date();
  const targetDate = new Date(followUpDate);
  targetDate.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);

  // Schedule day-of notification
  if (targetDate.getTime() > now.getTime()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔍 Nachprüfung heute",
        body: `Nachprüfung fällig: ${defectTitle}${location ? ` (${location})` : ""}`,
        data: { type: "followup", defectId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: targetDate,
      },
    });
  }

  // Schedule day-before notification
  const dayBefore = new Date(followUpDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);

  if (dayBefore.getTime() > now.getTime()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "📋 Nachprüfung morgen",
        body: `Morgen: Nachprüfung für "${defectTitle}"`,
        data: { type: "followup_reminder", defectId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dayBefore,
      },
    });
  }
}

export async function sendImmediateNotification(title: string, body: string, data?: any): Promise<void> {
  if (Platform.OS === "web") return;
  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: null,
  });
}

/**
 * Get all defects that have a follow-up date set and are pending inspection.
 */
export async function getPendingFollowUps(): Promise<any[]> {
  try {
    // Use getDefects from defect-store (Single Source of Truth)
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects();
    return defects.filter((d) =>
      d.followUpDate &&
      d.status !== "erledigt" &&
      d.status !== "geschlossen"
    ).sort((a, b) => new Date(a.followUpDate!).getTime() - new Date(b.followUpDate!).getTime());
  } catch {
    return [];
  }
}

/**
 * Get overdue follow-ups (follow-up date has passed but defect not resolved).
 */
export async function getOverdueFollowUps(): Promise<any[]> {
  try {
    const pending = await getPendingFollowUps();
    const now = new Date();
    return pending.filter((d: any) => new Date(d.followUpDate) < now);
  } catch {
    return [];
  }
}
