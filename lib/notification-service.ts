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
  reminderHour: number; // 0-23
  reminderMinute: number; // 0-59
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  openDefectsReminder: true,
  checklistReminder: true,
  dailyDigest: true,
  reminderHour: 8,
  reminderMinute: 0,
};

const PREFS_KEY = "notification_preferences";

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
}

async function scheduleDefectReminder(prefs: NotificationPreferences): Promise<void> {
  try {
    const defectsData = await AsyncStorage.getItem("defects");
    const defects = JSON.parse(defectsData || "[]");
    const openDefects = defects.filter((d: any) => d.status === "open");

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

export async function sendImmediateNotification(title: string, body: string, data?: any): Promise<void> {
  if (Platform.OS === "web") return;
  const hasPermission = await requestPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: null,
  });
}
