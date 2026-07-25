import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const REMINDER_SETTINGS_KEY = "task-reminder-settings";

export type ReminderSettings = {
  enabled: boolean;
  reminderHour: number; // 0-23
  reminderMinute: number; // 0-59
  daysBeforeDue: number; // how many days before due date to remind
};

const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: true,
  reminderHour: 9,
  reminderMinute: 0,
  daysBeforeDue: 1,
};

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

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("task-reminders", {
      name: "Aufgaben-Erinnerungen",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  const { granted: previouslyGranted } = await Notifications.getPermissionsAsync();
  if (previouslyGranted) return true;

  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  try {
    const data = await AsyncStorage.getItem(REMINDER_SETTINGS_KEY);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(settings));
  if (settings.enabled) {
    await scheduleTaskReminders();
  } else {
    await cancelAllReminders();
  }
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

type Todo = {
  id: string;
  text: string;
  done: boolean;
  dueDate?: string;
  protocolTitle?: string;
};

export async function scheduleTaskReminders(): Promise<void> {
  if (Platform.OS === "web") return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  const settings = await getReminderSettings();
  if (!settings.enabled) return;

  // Cancel existing reminders
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Load all protocols and their todos
  try {
    const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
    const now = new Date();
    let scheduledCount = 0;

    for (const protocol of protocols) {
      if (!protocol.todos || protocol.status !== "ready") continue;

      for (const todo of protocol.todos as Todo[]) {
        if (todo.done || !todo.dueDate) continue;

        const dueDate = new Date(todo.dueDate);
        const reminderDate = new Date(dueDate);
        reminderDate.setDate(reminderDate.getDate() - settings.daysBeforeDue);
        reminderDate.setHours(settings.reminderHour, settings.reminderMinute, 0, 0);

        // Only schedule future reminders (max 64 to stay within limits)
        if (reminderDate > now && scheduledCount < 60) {
          const secondsUntil = Math.floor((reminderDate.getTime() - now.getTime()) / 1000);

          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Aufgabe fällig! 📋",
              body: `"${todo.text}" – Frist: ${dueDate.toLocaleDateString("de-DE")}${protocol.templateName ? ` (${protocol.templateName})` : ""}`,
              data: { protocolId: protocol.id, todoId: todo.id },
              ...(Platform.OS === "android" ? { channelId: "task-reminders" } : {}),
            },
            trigger: { seconds: secondsUntil, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
          });
          scheduledCount++;
        }

        // Also schedule on due date if not yet passed
        if (dueDate > now && scheduledCount < 60) {
          const dueDateMorning = new Date(dueDate);
          dueDateMorning.setHours(settings.reminderHour, settings.reminderMinute, 0, 0);

          if (dueDateMorning > now) {
            const secondsUntilDue = Math.floor((dueDateMorning.getTime() - now.getTime()) / 1000);
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "Aufgabe heute fällig! ⚠️",
                body: `"${todo.text}" ist heute fällig!${protocol.templateName ? ` (${protocol.templateName})` : ""}`,
                data: { protocolId: protocol.id, todoId: todo.id },
                ...(Platform.OS === "android" ? { channelId: "task-reminders" } : {}),
              },
              trigger: { seconds: secondsUntilDue, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
            });
            scheduledCount++;
          }
        }
      }
    }
  } catch (error) {
    console.error("Error scheduling reminders:", error);
  }
}

// Schedule daily check for overdue tasks
export async function scheduleDailyOverdueCheck(): Promise<void> {
  if (Platform.OS === "web") return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  // Check overdue tasks now
  try {
    const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
    const now = new Date();
    let overdueCount = 0;

    for (const protocol of protocols) {
      if (!protocol.todos || protocol.status !== "ready") continue;
      for (const todo of protocol.todos as Todo[]) {
        if (todo.done || !todo.dueDate) continue;
        const dueDate = new Date(todo.dueDate);
        if (dueDate < now) overdueCount++;
      }
    }

    if (overdueCount > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Überfällige Aufgaben! 🔴",
          body: `Du hast ${overdueCount} überfällige Aufgabe${overdueCount !== 1 ? "n" : ""}. Tippe zum Anzeigen.`,
          ...(Platform.OS === "android" ? { channelId: "task-reminders" } : {}),
        },
        trigger: null, // Show immediately
      });
    }
  } catch { /* ignore */ }
}
