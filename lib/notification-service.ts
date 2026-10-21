import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ──────────────────────────────────────────────────────────────────────────────
// Unified notification service.
//
// ONE settings object + ONE scheduler. `scheduleNotifications()` is the single
// place that schedules anything: it cancels ALL scheduled notifications once and
// then reschedules everything from the current preferences. That removes the old
// problem where several screens/schedulers kept wiping each other.
// ──────────────────────────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Weekday numbers use the expo convention: 1=Sun, 2=Mon … 7=Sat. */
export type NotificationPreferences = {
  enabled: boolean; // master switch

  // Shared daily reminders (one time + one weekday selection)
  reminderHour: number; // 0-23
  reminderMinute: number; // 0-59
  weekdays: number[]; // expo 1..7; empty or all 7 => every day
  openDefectsReminder: boolean;
  checklistReminder: boolean;
  taskReminder: boolean; // fällige Aufgaben (todos with a due date)
  taskLeadDays: number; // remind this many days before a todo is due
  followUpReminder: boolean; // Nachprüfungen
  defectDeadlineReminder: boolean; // Mängel-Fristen
  defectDeadlineDays: number; // days before a defect deadline

  // Tages-Zusammenfassung (own time + weekdays + content)
  summaryEnabled: boolean;
  summaryHour: number;
  summaryMinute: number;
  summaryWeekdays: number[]; // expo 1..7
  summaryIncludeProtocols: boolean;
  summaryIncludeDefects: boolean;
  summaryIncludeTasks: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  reminderHour: 8,
  reminderMinute: 0,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  openDefectsReminder: true,
  checklistReminder: true,
  taskReminder: true,
  taskLeadDays: 1,
  followUpReminder: true,
  defectDeadlineReminder: false,
  defectDeadlineDays: 2,
  summaryEnabled: false,
  summaryHour: 18,
  summaryMinute: 0,
  summaryWeekdays: [2, 3, 4, 5, 6],
  summaryIncludeProtocols: true,
  summaryIncludeDefects: true,
  summaryIncludeTasks: true,
};

const PREFS_KEY = "notification_preferences";
// Legacy keys consolidated on first load so users keep their choices.
const LEGACY_DAILY_SUMMARY_KEY = "daily-summary-settings";
const LEGACY_TASK_REMINDER_KEY = "task-reminder-settings";

async function migrateFromLegacy(base: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, ...base };
  try {
    const ds = await AsyncStorage.getItem(LEGACY_DAILY_SUMMARY_KEY);
    if (ds) {
      const s = JSON.parse(ds);
      prefs.summaryEnabled = Boolean(s.enabled) || Boolean((base as any).dailyDigest);
      if (typeof s.hour === "number") prefs.summaryHour = s.hour;
      if (typeof s.minute === "number") prefs.summaryMinute = s.minute;
      if (Array.isArray(s.weekdays) && s.weekdays.length) prefs.summaryWeekdays = s.weekdays;
      if (typeof s.includeProtocols === "boolean") prefs.summaryIncludeProtocols = s.includeProtocols;
      if (typeof s.includeDefects === "boolean") prefs.summaryIncludeDefects = s.includeDefects;
      if (typeof s.includeTasks === "boolean") prefs.summaryIncludeTasks = s.includeTasks;
      if (typeof s.defectDeadlineReminder === "boolean") prefs.defectDeadlineReminder = s.defectDeadlineReminder;
      if (typeof s.defectDeadlineDays === "number") prefs.defectDeadlineDays = s.defectDeadlineDays;
    }
  } catch {}
  try {
    const tr = await AsyncStorage.getItem(LEGACY_TASK_REMINDER_KEY);
    if (tr) {
      const s = JSON.parse(tr);
      if (typeof s.enabled === "boolean") prefs.taskReminder = s.enabled;
      if (typeof s.daysBeforeDue === "number") prefs.taskLeadDays = s.daysBeforeDue;
    }
  } catch {}
  return prefs;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const data = await AsyncStorage.getItem(PREFS_KEY);
    const parsed = data ? JSON.parse(data) : null;
    // v2 marker means the unified object is already stored.
    if (parsed && parsed.__v2) {
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
    // First run after the consolidation: pull values from the old stores.
    const migrated = await migrateFromLegacy(parsed || {});
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...migrated, __v2: true }));
    return migrated;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, __v2: true }));
  await scheduleNotifications();
}

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { granted: previouslyGranted } = await Notifications.getPermissionsAsync();
  if (previouslyGranted) return true;
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

// Schedule a push at a fixed clock time, honoring a weekday selection. If all 7
// (or none) are selected, use a single DAILY trigger; otherwise one WEEKLY
// trigger per selected weekday.
async function scheduleAtTime(
  content: Notifications.NotificationContentInput,
  hour: number,
  minute: number,
  weekdays: number[],
): Promise<void> {
  const h = ((hour % 24) + 24) % 24;
  const m = ((minute % 60) + 60) % 60;
  if (!weekdays || weekdays.length === 0 || weekdays.length >= 7) {
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: h, minute: m },
    });
    return;
  }
  for (const weekday of weekdays) {
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour: h, minute: m },
    });
  }
}

/** THE single scheduler. Cancels everything, then reschedules from prefs. */
export async function scheduleNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const prefs = await getNotificationPreferences();
    if (!prefs.enabled) return;
    if (!(await requestPermissions())) return;

    if (prefs.openDefectsReminder) await scheduleDefectReminder(prefs);
    if (prefs.checklistReminder) await scheduleChecklistReminder(prefs);
    if (prefs.taskReminder) await scheduleTaskReminders(prefs);
    // Nachprüfung (follow-up) und Mängel-Fristen auf Wunsch entfernt — sie waren
    // doppelt zu den Aufgaben-/Offene-Mängel-Erinnerungen und verursachten zudem
    // sofortige Spam-Pushes. Nicht mehr planen.
    if (prefs.summaryEnabled) await scheduleSummary(prefs);
  } catch {}
}

async function scheduleDefectReminder(prefs: NotificationPreferences): Promise<void> {
  try {
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects();
    const open = defects.filter(
      (d) => d.status === "offen" || d.status === "zugewiesen" || d.status === "in_bearbeitung" || d.status === "nachbesserung",
    );
    if (open.length === 0) return;
    await scheduleAtTime(
      {
        title: "Offene Mängel",
        body: `Du hast ${open.length} offene ${open.length === 1 ? "Mangel" : "Mängel"} zu bearbeiten.`,
        data: { type: "defects" },
        sound: true,
      },
      prefs.reminderHour,
      prefs.reminderMinute,
      prefs.weekdays,
    );
  } catch {}
}

async function scheduleChecklistReminder(prefs: NotificationPreferences): Promise<void> {
  try {
    const checklistsData = await AsyncStorage.getItem("checklists_progress");
    const progress = JSON.parse(checklistsData || "{}");
    let incomplete = 0;
    Object.values(progress).forEach((items: any) => {
      if (Array.isArray(items)) incomplete += items.filter((i: any) => !i.checked).length;
    });
    if (incomplete === 0) return;
    await scheduleAtTime(
      {
        title: "Checklisten-Erinnerung",
        body: `${incomplete} offene ${incomplete === 1 ? "Punkt" : "Punkte"} in deinen Checklisten.`,
        data: { type: "checklists" },
        sound: true,
      },
      prefs.reminderHour,
      prefs.reminderMinute + 5,
      prefs.weekdays,
    );
  } catch {}
}

type Todo = { id: string; text?: string; done?: boolean; dueDate?: string };

// Per-todo reminders: `taskLeadDays` before each todo's due date + on the due date.
async function scheduleTaskReminders(prefs: NotificationPreferences): Promise<void> {
  try {
    const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
    const now = new Date();
    let count = 0;
    for (const protocol of protocols) {
      if (!protocol.todos || protocol.status !== "ready") continue;
      for (const todo of protocol.todos as Todo[]) {
        if (todo.done || !todo.dueDate) continue;
        const due = new Date(todo.dueDate);

        const remindAt = new Date(due);
        remindAt.setDate(remindAt.getDate() - prefs.taskLeadDays);
        remindAt.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
        if (remindAt > now && count < 60) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Aufgabe fällig! 📋",
              body: `"${todo.text || "Aufgabe"}" – Frist: ${due.toLocaleDateString("de-DE")}${protocol.templateName ? ` (${protocol.templateName})` : ""}`,
              data: { type: "task", protocolId: protocol.id, todoId: todo.id },
              sound: true,
            },
            trigger: { seconds: Math.floor((remindAt.getTime() - now.getTime()) / 1000), type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
          });
          count++;
        }

        const dueMorning = new Date(due);
        dueMorning.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
        if (dueMorning > now && count < 60) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Aufgabe heute fällig! ⚠️",
              body: `"${todo.text || "Aufgabe"}" ist heute fällig!${protocol.templateName ? ` (${protocol.templateName})` : ""}`,
              data: { type: "task", protocolId: protocol.id, todoId: todo.id },
              sound: true,
            },
            trigger: { seconds: Math.floor((dueMorning.getTime() - now.getTime()) / 1000), type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
          });
          count++;
        }
      }
    }
  } catch {}
}

async function scheduleDeadlineReminders(prefs: NotificationPreferences): Promise<void> {
  try {
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects();
    const now = new Date();
    for (const defect of defects) {
      if (!defect.dueDate || defect.status === "erledigt" || defect.status === "geschlossen") continue;
      const due = new Date(defect.dueDate);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
      if (diffDays < 0) {
        const t = new Date();
        t.setHours(prefs.reminderHour, prefs.reminderMinute + 10, 0, 0);
        if (t.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: { title: "⚠️ Frist überschritten", body: `"${defect.title}" - Frist war am ${due.toLocaleDateString("de-DE")}`, data: { type: "overdue_deadline", defectId: defect.id }, sound: true },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: prefs.reminderHour, minute: prefs.reminderMinute + 10 },
          });
        }
      } else if (diffDays === 0) {
        await Notifications.scheduleNotificationAsync({
          content: { title: "⏰ Frist heute", body: `"${defect.title}" muss heute erledigt werden!`, data: { type: "deadline_today", defectId: defect.id }, sound: true },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: prefs.reminderHour, minute: prefs.reminderMinute + 2 },
        });
      } else if (diffDays >= 1 && diffDays <= 3) {
        const t = new Date(defect.dueDate);
        t.setDate(t.getDate() - 1);
        t.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
        if (t.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: { title: `📅 Frist in ${diffDays} ${diffDays === 1 ? "Tag" : "Tagen"}`, body: `"${defect.title}" - Frist: ${due.toLocaleDateString("de-DE")}`, data: { type: "deadline_upcoming", defectId: defect.id }, sound: true },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: t },
          });
        }
      }
    }
  } catch {}
}

async function scheduleFollowUpReminders(prefs: NotificationPreferences): Promise<void> {
  try {
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects();
    const now = new Date();
    const maxFutureDays = 30;
    const withFollowUp = defects.filter((d: any) => d.followUpDate && d.status !== "erledigt" && d.status !== "geschlossen");
    for (const defect of withFollowUp) {
      const fu = new Date(defect.followUpDate!);
      const diffDays = Math.ceil((fu.getTime() - now.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays <= maxFutureDays) {
        const t = new Date(defect.followUpDate!);
        t.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
        if (t.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: { title: "🔍 Nachprüfung heute", body: `Nachprüfung fällig: ${defect.title}${defect.location ? ` (${defect.location})` : ""}`, data: { type: "followup", defectId: defect.id }, sound: true },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: t },
          });
        }
      }
      if (diffDays >= 1 && diffDays <= maxFutureDays) {
        const t = new Date(defect.followUpDate!);
        t.setDate(t.getDate() - 1);
        t.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
        if (t.getTime() > now.getTime()) {
          await Notifications.scheduleNotificationAsync({
            content: { title: "📋 Nachprüfung morgen", body: `Morgen: Nachprüfung für "${defect.title}"${defect.assignee ? ` (${defect.assignee})` : ""}`, data: { type: "followup_reminder", defectId: defect.id }, sound: true },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: t },
          });
        }
      }
    }
  } catch {}
}

// Mängel-Fristen: immediate pushes for overdue / soon-due defects (fires once now,
// re-evaluated each time the app reschedules).
async function checkDefectDeadlines(prefs: NotificationPreferences): Promise<void> {
  try {
    const { getDefects } = await import("@/lib/defect-store");
    const all = await getDefects();
    const now = new Date();
    const horizon = new Date(now.getTime() + prefs.defectDeadlineDays * 86400000);
    const skip = (s: string) => s === "erledigt" || s === "geschlossen" || s === "abgelehnt";
    const upcoming = all.filter((d) => !skip(d.status) && d.dueDate && new Date(d.dueDate) <= horizon && new Date(d.dueDate) >= now);
    const overdue = all.filter((d) => !skip(d.status) && d.dueDate && new Date(d.dueDate) < now);
    // IMPORTANT: schedule these for the daily reminder time, NOT `trigger: null`
    // (which fires IMMEDIATELY). scheduleNotifications() runs on app start and
    // whenever the notification settings screen opens/changes — an immediate
    // trigger spammed the user with these defect pushes every single time.
    const bump = (addMin: number) => {
      const total = prefs.reminderHour * 60 + prefs.reminderMinute + addMin;
      return { hour: Math.floor(total / 60) % 24, minute: ((total % 60) + 60) % 60 };
    };
    if (overdue.length > 0) {
      const b = bump(15);
      await Notifications.scheduleNotificationAsync({
        content: { title: `⚠️ ${overdue.length} überfällige Mängel`, body: overdue.slice(0, 3).map((d) => d.title).join(", ") + (overdue.length > 3 ? ` und ${overdue.length - 3} weitere` : ""), data: { type: "defect_overdue" } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: b.hour, minute: b.minute },
      });
    }
    if (upcoming.length > 0) {
      const b = bump(17);
      await Notifications.scheduleNotificationAsync({
        content: { title: `📋 ${upcoming.length} Mängel-Fristen in ${prefs.defectDeadlineDays} Tagen`, body: upcoming.slice(0, 3).map((d) => d.title).join(", ") + (upcoming.length > 3 ? ` und ${upcoming.length - 3} weitere` : ""), data: { type: "defect_deadline" } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: b.hour, minute: b.minute },
      });
    }
  } catch {}
}

// Build the summary body from the chosen content flags (snapshot at schedule time).
async function buildSummaryBody(prefs: NotificationPreferences): Promise<string> {
  const parts: string[] = [];
  try {
    const { getDefects } = await import("@/lib/defect-store");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (prefs.summaryIncludeProtocols) {
      try {
        const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
        const n = protocols.filter((p: any) => new Date(p.createdAt) >= today).length;
        if (n > 0) parts.push(`${n} Protokoll${n > 1 ? "e" : ""} heute`);
      } catch {}
    }
    if (prefs.summaryIncludeDefects) {
      const defects = await getDefects();
      const open = defects.filter((d) => d.status !== "erledigt" && d.status !== "geschlossen" && d.status !== "abgelehnt");
      const overdue = defects.filter((d) => d.dueDate && new Date(d.dueDate) < new Date() && d.status !== "erledigt" && d.status !== "geschlossen" && d.status !== "abgelehnt");
      if (open.length > 0) parts.push(`${open.length} offene Mängel`);
      if (overdue.length > 0) parts.push(`${overdue.length} überfällig`);
    }
    if (prefs.summaryIncludeTasks) {
      try {
        const protocols = JSON.parse((await AsyncStorage.getItem("protocols")) || "[]");
        let open = 0;
        for (const p of protocols) if (Array.isArray(p.todos)) open += p.todos.filter((t: any) => !t.done).length;
        if (open > 0) parts.push(`${open} offene Aufgaben`);
      } catch {}
    }
  } catch {}
  return parts.length > 0 ? parts.join(" · ") : "Tippe für deine Tagesübersicht.";
}

async function scheduleSummary(prefs: NotificationPreferences): Promise<void> {
  const body = await buildSummaryBody(prefs);
  await scheduleAtTime(
    { title: "BuildKI – Tages-Zusammenfassung", body, data: { type: "daily_summary" } },
    prefs.summaryHour,
    prefs.summaryMinute,
    prefs.weekdays, // shared weekday selection (one picker in the UI)
  );
}

/** Schedule follow-up pushes for a single defect (called when a date is set). */
export async function scheduleFollowUpForDefect(defectId: string, defectTitle: string, followUpDate: string, location?: string): Promise<void> {
  if (Platform.OS === "web") return;
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.followUpReminder) return;
  if (!(await requestPermissions())) return;
  const now = new Date();
  const target = new Date(followUpDate);
  target.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
  if (target.getTime() > now.getTime()) {
    await Notifications.scheduleNotificationAsync({
      content: { title: "🔍 Nachprüfung heute", body: `Nachprüfung fällig: ${defectTitle}${location ? ` (${location})` : ""}`, data: { type: "followup", defectId }, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
    });
  }
  const dayBefore = new Date(followUpDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  dayBefore.setHours(prefs.reminderHour, prefs.reminderMinute, 0, 0);
  if (dayBefore.getTime() > now.getTime()) {
    await Notifications.scheduleNotificationAsync({
      content: { title: "📋 Nachprüfung morgen", body: `Morgen: Nachprüfung für "${defectTitle}"`, data: { type: "followup_reminder", defectId }, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dayBefore },
    });
  }
}

export async function sendImmediateNotification(title: string, body: string, data?: any): Promise<void> {
  if (Platform.OS === "web") return;
  if (!(await requestPermissions())) return;
  await Notifications.scheduleNotificationAsync({ content: { title, body, data, sound: true }, trigger: null });
}

export async function getPendingFollowUps(): Promise<any[]> {
  try {
    const { getDefects } = await import("@/lib/defect-store");
    const defects = await getDefects();
    return defects
      .filter((d) => d.followUpDate && d.status !== "erledigt" && d.status !== "geschlossen")
      .sort((a, b) => new Date(a.followUpDate!).getTime() - new Date(b.followUpDate!).getTime());
  } catch {
    return [];
  }
}

export async function getOverdueFollowUps(): Promise<any[]> {
  try {
    const pending = await getPendingFollowUps();
    const now = new Date();
    return pending.filter((d: any) => new Date(d.followUpDate) < now);
  } catch {
    return [];
  }
}
