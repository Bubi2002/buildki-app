/**
 * Recurring Meetings - Auto-prepare protocols for regular meetings
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const RECURRING_MEETINGS_KEY = "recurring-meetings";

export type RecurrencePattern = "daily" | "weekly" | "biweekly" | "monthly";

export type RecurringMeeting = {
  id: string;
  title: string;
  description: string;
  templateId: string;
  templateName: string;
  recurrence: RecurrencePattern;
  dayOfWeek?: number; // 0-6 (Sun-Sat) for weekly/biweekly
  dayOfMonth?: number; // 1-31 for monthly
  timeHour: number; // 0-23
  timeMinute: number; // 0-59
  duration: number; // minutes
  participants: string[];
  projectId?: string;
  projectName?: string;
  isActive: boolean;
  lastTriggered?: string;
  createdAt: string;
  notes?: string;
};

/**
 * Get all recurring meetings
 */
export async function getRecurringMeetings(): Promise<RecurringMeeting[]> {
  try {
    const data = await AsyncStorage.getItem(RECURRING_MEETINGS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save a recurring meeting
 */
export async function saveRecurringMeeting(meeting: RecurringMeeting): Promise<void> {
  const meetings = await getRecurringMeetings();
  const existingIdx = meetings.findIndex(m => m.id === meeting.id);
  if (existingIdx >= 0) {
    meetings[existingIdx] = meeting;
  } else {
    meetings.push(meeting);
  }
  await AsyncStorage.setItem(RECURRING_MEETINGS_KEY, JSON.stringify(meetings));
}

/**
 * Delete a recurring meeting
 */
export async function deleteRecurringMeeting(id: string): Promise<void> {
  const meetings = await getRecurringMeetings();
  const filtered = meetings.filter(m => m.id !== id);
  await AsyncStorage.setItem(RECURRING_MEETINGS_KEY, JSON.stringify(filtered));
}

/**
 * Toggle active state
 */
export async function toggleMeetingActive(id: string): Promise<void> {
  const meetings = await getRecurringMeetings();
  const updated = meetings.map(m => m.id === id ? { ...m, isActive: !m.isActive } : m);
  await AsyncStorage.setItem(RECURRING_MEETINGS_KEY, JSON.stringify(updated));
}

/**
 * Get meetings that should be triggered today
 */
export async function getTodaysMeetings(): Promise<RecurringMeeting[]> {
  const meetings = await getRecurringMeetings();
  const now = new Date();
  const today = now.getDay(); // 0-6
  const dateOfMonth = now.getDate();
  
  return meetings.filter(m => {
    if (!m.isActive) return false;
    
    // Check if already triggered today
    if (m.lastTriggered) {
      const lastDate = new Date(m.lastTriggered);
      if (lastDate.toDateString() === now.toDateString()) return false;
    }
    
    switch (m.recurrence) {
      case "daily":
        return true;
      case "weekly":
        return m.dayOfWeek === today;
      case "biweekly": {
        if (m.dayOfWeek !== today) return false;
        // Check if it's the right week (every 2 weeks from creation)
        const created = new Date(m.createdAt);
        const weeksDiff = Math.floor((now.getTime() - created.getTime()) / (7 * 24 * 60 * 60 * 1000));
        return weeksDiff % 2 === 0;
      }
      case "monthly":
        return m.dayOfMonth === dateOfMonth;
      default:
        return false;
    }
  });
}

/**
 * Mark a meeting as triggered
 */
export async function markMeetingTriggered(id: string): Promise<void> {
  const meetings = await getRecurringMeetings();
  const updated = meetings.map(m => 
    m.id === id ? { ...m, lastTriggered: new Date().toISOString() } : m
  );
  await AsyncStorage.setItem(RECURRING_MEETINGS_KEY, JSON.stringify(updated));
}

/**
 * Get next occurrence of a recurring meeting
 */
export function getNextOccurrence(meeting: RecurringMeeting): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(meeting.timeHour, meeting.timeMinute, 0, 0);
  
  switch (meeting.recurrence) {
    case "daily":
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    case "weekly":
    case "biweekly": {
      const targetDay = meeting.dayOfWeek || 0;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0 || (daysUntil === 0 && next <= now)) {
        daysUntil += meeting.recurrence === "biweekly" ? 14 : 7;
      }
      next.setDate(next.getDate() + daysUntil);
      break;
    }
    case "monthly": {
      const targetDate = meeting.dayOfMonth || 1;
      next.setDate(targetDate);
      if (next <= now) next.setMonth(next.getMonth() + 1);
      break;
    }
  }
  return next;
}

/**
 * Get human-readable recurrence description
 */
export function getRecurrenceLabel(meeting: RecurringMeeting): string {
  const days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const time = `${meeting.timeHour.toString().padStart(2, "0")}:${meeting.timeMinute.toString().padStart(2, "0")}`;
  
  switch (meeting.recurrence) {
    case "daily":
      return `Täglich um ${time}`;
    case "weekly":
      return `Jeden ${days[meeting.dayOfWeek || 0]} um ${time}`;
    case "biweekly":
      return `Alle 2 Wochen, ${days[meeting.dayOfWeek || 0]} um ${time}`;
    case "monthly":
      return `Monatlich am ${meeting.dayOfMonth || 1}. um ${time}`;
    default:
      return time;
  }
}
