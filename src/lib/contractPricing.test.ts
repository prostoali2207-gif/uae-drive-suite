import { describe, expect, it } from "vitest";
import { formatMonthlyBillingPeriod, getMonthlyBillingBreakdown, getRateUnits } from "./contractPricing";

describe("contractPricing", () => {
  it("treats matching calendar dates as one monthly billing unit", () => {
    const breakdown = getMonthlyBillingBreakdown("2026-07-04", "2026-08-04");

    expect(breakdown).toEqual({ months: 1, extraDays: 0, units: 1 });
    expect(Math.round(getRateUnits(31, "Monthly", "2026-07-04", "2026-08-04") * 2000)).toBe(2000);
    expect(formatMonthlyBillingPeriod("2026-07-04", "2026-08-04")).toBe("1 month");
  });

  it("charges extra days only after complete calendar months", () => {
    const breakdown = getMonthlyBillingBreakdown("2026-07-04", "2026-08-05");

    expect(breakdown.months).toBe(1);
    expect(breakdown.extraDays).toBe(1);
    expect(Math.round(breakdown.units * 2000)).toBe(2067);
    expect(formatMonthlyBillingPeriod("2026-07-04", "2026-08-05")).toBe("1 month + 1 day");
  });

  it("counts multiple complete calendar months", () => {
    const breakdown = getMonthlyBillingBreakdown("2026-07-04", "2026-09-04");

    expect(breakdown).toEqual({ months: 2, extraDays: 0, units: 2 });
    expect(Math.round(breakdown.units * 2000)).toBe(4000);
  });

  it("keeps daily and annual unit logic unchanged", () => {
    expect(getRateUnits(31, "Daily", "2026-07-04", "2026-08-04")).toBe(31);
    expect(getRateUnits(31, "Annual", "2026-07-04", "2026-08-04")).toBe(31 / 365);
  });
});
