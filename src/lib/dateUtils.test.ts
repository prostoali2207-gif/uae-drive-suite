import { describe, expect, it } from "vitest";
import { addDaysToDateInputValue, diffCalendarDays, parseDateTimeInput } from "./dateUtils";

describe("dateUtils", () => {
  it("calculates the required contract duration from date inputs", () => {
    expect(diffCalendarDays("2026-06-22", "2026-06-27")).toBe(5);
  });

  it("parses date and time inputs as local components", () => {
    const parsed = parseDateTimeInput("2026-06-22", "14:45");

    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(5);
    expect(parsed?.getDate()).toBe(22);
    expect(parsed?.getHours()).toBe(14);
    expect(parsed?.getMinutes()).toBe(45);
  });

  it("adds days to datetime-local values using the date part only", () => {
    expect(addDaysToDateInputValue("2026-06-27T14:45", 15, "2026-06-24")).toBe("2026-07-12");
  });
});
