import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
}

/**
 * Request calendar permissions
 */
export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === "granted";
}

/**
 * Get the default calendar ID for creating events
 */
export async function getDefaultCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

  if (Platform.OS === "ios") {
    const defaultCalendar = calendars.find(
      (cal) => cal.source?.name === "Default" || cal.allowsModifications
    );
    return defaultCalendar?.id || calendars[0]?.id || null;
  }

  // Android: find the primary calendar
  const primaryCalendar = calendars.find(
    (cal) => cal.isPrimary || cal.allowsModifications
  );
  return primaryCalendar?.id || calendars[0]?.id || null;
}

/**
 * Get today's calendar events
 */
export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const hasPermission = await requestCalendarPermission();
  if (!hasPermission) return [];

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarIds = calendars.map((cal) => cal.id);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const events = await Calendar.getEventsAsync(calendarIds, startOfDay, endOfDay);

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startDate: new Date(e.startDate),
    endDate: new Date(e.endDate),
    notes: e.notes || undefined,
  }));
}

/**
 * Get current or upcoming event (within 30 min window)
 */
export async function getCurrentEvent(): Promise<CalendarEvent | null> {
  const events = await getTodayEvents();
  const now = new Date();
  const windowMs = 30 * 60 * 1000; // 30 minutes

  // Find event that is currently happening or starts within 30 min
  const current = events.find((e) => {
    const start = e.startDate.getTime();
    const end = e.endDate.getTime();
    const nowMs = now.getTime();

    return (nowMs >= start && nowMs <= end) || (start > nowMs && start - nowMs <= windowMs);
  });

  return current || null;
}

/**
 * Create a calendar event for a protocol
 */
export async function createProtocolEvent(params: {
  title: string;
  notes: string;
  startDate?: Date;
}): Promise<string | null> {
  const hasPermission = await requestCalendarPermission();
  if (!hasPermission) return null;

  const calendarId = await getDefaultCalendarId();
  if (!calendarId) return null;

  const start = params.startDate || new Date();
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min duration

  const eventId = await Calendar.createEventAsync(calendarId, {
    title: params.title,
    notes: params.notes,
    startDate: start,
    endDate: end,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return eventId;
}

/**
 * Add protocol notes to an existing calendar event
 */
export async function addNotesToEvent(eventId: string, notes: string): Promise<boolean> {
  try {
    await Calendar.updateEventAsync(eventId, {
      notes,
    });
    return true;
  } catch {
    return false;
  }
}
