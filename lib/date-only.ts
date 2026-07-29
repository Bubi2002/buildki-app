const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const GERMAN_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function createValidatedDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function toDateOnlyValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayDateOnly(now: Date = new Date()): string {
  return toDateOnlyValue(now);
}

export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;
  return createValidatedDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function parseGermanDateInput(value: string): string | null {
  const match = GERMAN_DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const date = createValidatedDate(Number(match[3]), Number(match[2]), Number(match[1]));
  return date ? toDateOnlyValue(date) : null;
}

export function formatDateOnly(value: string, locale = "de-DE"): string {
  const date = parseDateOnly(value);
  if (!date) return value;
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function addDaysToDateOnly(value: string, days: number): string {
  const date = parseDateOnly(value);
  if (!date) throw new Error(`Invalid date-only value: ${value}`);
  date.setDate(date.getDate() + days);
  return toDateOnlyValue(date);
}

export function isDateOnOrAfter(value: string, minimum: string): boolean {
  return Boolean(parseDateOnly(value) && parseDateOnly(minimum) && value >= minimum);
}
