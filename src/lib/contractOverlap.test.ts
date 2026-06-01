import { describe, expect, it } from "vitest";
import {
  findOverlappingContract,
  formatContractOverlapMessage,
  parseContractDateTime,
  type ContractOverlapRow,
} from "./contractOverlap";

const baseContract: ContractOverlapRow = {
  id: "12345678-aaaa-bbbb-cccc-1234567890ab",
  start_date: "2026-06-10",
  start_time: "10:00:00",
  end_date: "2026-06-15",
  end_time: "10:00:00",
  status: "Active",
  clients: { full_name: "Ali Manager" },
};

function overlap(startDate: string, startTime: string, endDate: string, endTime: string) {
  return findOverlappingContract(
    [baseContract],
    parseContractDateTime(startDate, startTime),
    parseContractDateTime(endDate, endTime),
  );
}

describe("contract overlap protection", () => {
  it("blocks the same vehicle with the same dates and times", () => {
    expect(overlap("2026-06-10", "10:00", "2026-06-15", "10:00")).toBe(baseContract);
  });

  it("blocks the same vehicle with partially overlapping dates and times", () => {
    expect(overlap("2026-06-14", "09:00", "2026-06-18", "10:00")).toBe(baseContract);
  });

  it("allows back-to-back contracts when one ends before the other starts", () => {
    expect(overlap("2026-06-15", "10:00", "2026-06-18", "10:00")).toBeNull();
  });

  it("allows periods with no matching vehicle contracts", () => {
    const result = findOverlappingContract(
      [],
      parseContractDateTime("2026-06-10", "10:00"),
      parseContractDateTime("2026-06-15", "10:00"),
    );
    expect(result).toBeNull();
  });

  it("ignores closed and cancelled contracts", () => {
    const closed = { ...baseContract, status: "Closed" };
    const cancelled = { ...baseContract, status: "Cancelled" };
    const newStart = parseContractDateTime("2026-06-10", "10:00");
    const newEnd = parseContractDateTime("2026-06-15", "10:00");

    expect(findOverlappingContract([closed, cancelled], newStart, newEnd)).toBeNull();
  });

  it("includes manager-facing conflict details", () => {
    expect(formatContractOverlapMessage(baseContract)).toContain(
      "This vehicle is already booked/rented during this period.",
    );
    expect(formatContractOverlapMessage(baseContract)).toContain("Ali Manager");
    expect(formatContractOverlapMessage(baseContract)).toContain("12345678");
    expect(formatContractOverlapMessage(baseContract)).toContain("2026-06-10 10:00");
    expect(formatContractOverlapMessage(baseContract)).toContain("2026-06-15 10:00");
    expect(formatContractOverlapMessage(baseContract)).toContain("Active");
  });
});
