import { diffCalendarDays, parseDateInput } from "./dateUtils";

export type ContractRateType = "Daily" | "Monthly" | "Annual";

export interface MonthlyBillingBreakdown {
  months: number;
  extraDays: number;
  units: number;
}

function addCalendarMonths(start: Date, months: number): Date {
  const targetMonth = start.getMonth() + months;
  const lastDayOfTargetMonth = new Date(start.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(
    start.getFullYear(),
    targetMonth,
    Math.min(start.getDate(), lastDayOfTargetMonth),
  );
}

export function getMonthlyBillingBreakdown(startDate: string, endDate: string): MonthlyBillingBreakdown {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  if (!start || !end || end <= start) return { months: 0, extraDays: 0, units: 0 };

  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (addCalendarMonths(start, months) > end) months -= 1;
  months = Math.max(0, months);

  const extraDaysStart = addCalendarMonths(start, months);
  const extraDays = diffCalendarDays(
    [
      extraDaysStart.getFullYear(),
      String(extraDaysStart.getMonth() + 1).padStart(2, "0"),
      String(extraDaysStart.getDate()).padStart(2, "0"),
    ].join("-"),
    endDate,
  );

  return {
    months,
    extraDays,
    units: months + extraDays / 30,
  };
}

export function getRateUnits(
  days: number,
  rateType: ContractRateType,
  startDate: string,
  endDate: string,
): number {
  if (rateType === "Monthly") return getMonthlyBillingBreakdown(startDate, endDate).units;
  if (rateType === "Annual") return days / 365;
  return days;
}

export function formatMonthlyBillingPeriod(startDate: string, endDate: string): string {
  const { months, extraDays } = getMonthlyBillingBreakdown(startDate, endDate);
  const parts: string[] = [];

  if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (extraDays > 0) parts.push(`${extraDays} ${extraDays === 1 ? "day" : "days"}`);

  return parts.length > 0 ? parts.join(" + ") : "0 days";
}
