const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_INPUT_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseDateInput(value: string | null | undefined): Date | null {
  const match = value?.slice(0, 10).match(DATE_INPUT_RE);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateTimeInput(dateValue: string | null | undefined, timeValue?: string | null): Date | null {
  const date = parseDateInput(dateValue);
  if (!date) return null;

  const timeMatch = (timeValue || "00:00").match(TIME_INPUT_RE);
  if (!timeMatch) return null;

  const [, hours, minutes, seconds = "00"] = timeMatch;
  date.setHours(Number(hours), Number(minutes), Number(seconds), 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function diffCalendarDays(start: string | null | undefined, end: string | null | undefined): number {
  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);
  if (!startDate || !endDate) return 0;

  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

export function addDaysToDateInputValue(value: string | null | undefined, daysToAdd: number, fallbackDate: string): string {
  const date = parseDateInput(value) ?? parseDateInput(fallbackDate);
  if (!date) return fallbackDate;

  date.setDate(date.getDate() + daysToAdd);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
