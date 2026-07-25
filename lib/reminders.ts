import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

type TodoItem = {
  task: string;
  assignee: string;
  priority: "hoch" | "mittel" | "niedrig";
  deadline: string;
  done: boolean;
};

type Protocol = {
  id: string;
  title: string;
  todos?: TodoItem[];
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

  const { granted: previouslyGranted } = await Notifications.getPermissionsAsync();
  if (previouslyGranted) return true;

  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

export async function scheduleTaskReminders(hoursBefore: number = 24): Promise<number> {
  if (Platform.OS === "web") return 0;

  // Cancel all existing reminders first
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Load all protocols
  const protocolsData = await AsyncStorage.getItem("protocols");
  const protocols: Protocol[] = JSON.parse(protocolsData || "[]");

  let scheduledCount = 0;
  const now = new Date();

  for (const protocol of protocols) {
    if (!protocol.todos) continue;

    for (const todo of protocol.todos) {
      if (todo.done || todo.deadline === "Offen") continue;

      // Parse deadline (format: "DD.MM.YYYY" or "DD.MM." or relative like "bis Freitag")
      const deadlineDate = parseGermanDate(todo.deadline);
      if (!deadlineDate) continue;

      // Calculate reminder time
      const reminderTime = new Date(deadlineDate.getTime() - hoursBefore * 60 * 60 * 1000);

      // Only schedule if reminder is in the future
      if (reminderTime > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⚠️ Aufgabe fällig: ${todo.priority === "hoch" ? "DRINGEND" : "Erinnerung"}`,
            body: `${todo.task}${todo.assignee !== "Nicht zugewiesen" ? ` (${todo.assignee})` : ""}\nFrist: ${todo.deadline}`,
            data: { protocolId: protocol.id, type: "task_reminder" },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderTime,
          },
        });
        scheduledCount++;
      }

      // Also schedule at deadline time
      if (deadlineDate > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🚨 Frist erreicht!`,
            body: `${todo.task} ist jetzt fällig!${todo.assignee !== "Nicht zugewiesen" ? ` (Verantwortlich: ${todo.assignee})` : ""}`,
            data: { protocolId: protocol.id, type: "task_deadline" },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: deadlineDate,
          },
        });
        scheduledCount++;
      }
    }
  }

  return scheduledCount;
}

function parseGermanDate(dateStr: string): Date | null {
  // Try DD.MM.YYYY format
  const fullMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (fullMatch) {
    const [, day, month, year] = fullMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 17, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }

  // Try DD.MM. format (assume current year)
  const shortMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})\./);
  if (shortMatch) {
    const [, day, month] = shortMatch;
    const year = new Date().getFullYear();
    const date = new Date(year, parseInt(month) - 1, parseInt(day), 17, 0, 0);
    // If date is in the past, assume next year
    if (date < new Date()) {
      date.setFullYear(year + 1);
    }
    return isNaN(date.getTime()) ? null : date;
  }

  // Try relative dates
  const weekdays: Record<string, number> = {
    montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4,
    freitag: 5, samstag: 6, sonntag: 0,
  };

  const lower = dateStr.toLowerCase();
  for (const [name, dayOfWeek] of Object.entries(weekdays)) {
    if (lower.includes(name)) {
      const now = new Date();
      const currentDay = now.getDay();
      let daysUntil = dayOfWeek - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      const target = new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
      target.setHours(17, 0, 0, 0);
      return target;
    }
  }

  return null;
}

export async function getScheduledRemindersCount(): Promise<number> {
  if (Platform.OS === "web") return 0;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.length;
}

export async function cancelAllReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
