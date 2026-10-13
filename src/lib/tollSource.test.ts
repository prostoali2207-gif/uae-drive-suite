import { describe, expect, it } from "vitest";
import { filterTollSource, isDarbTransaction } from "./tollSource";

const charges = [
  { id: "legacy", transaction_id: null, amount: 5 },
  { id: "salik", transaction_id: "8723456", amount: 7.3 },
  { id: "darb1", transaction_id: "DARB:AUTO:A73230:2026-10-01:22:03:43:GATE:4.00", amount: 4 },
  { id: "darb2", transaction_id: "DARB:AUTO:B11532:2026-10-03:15:49:36:GATE:4.00", amount: 4 },
  { id: "almost", transaction_id: "DARB-X", amount: 1 },
];

describe("Toll source separation", () => {
  it("keeps Salik including legacy rows with no transaction ID", () => {
    expect(filterTollSource(charges, "salik").map((row) => row.id)).toEqual(["legacy", "salik", "almost"]);
  });

  it("shows only Darb-prefixed entries in Darb", () => {
    expect(filterTollSource(charges, "darb").map((row) => row.id)).toEqual(["darb1", "darb2"]);
    expect(isDarbTransaction("DARB:123")).toBe(true);
    expect(isDarbTransaction(null)).toBe(false);
  });

  it("keeps source totals independent so bulk actions can use only selected IDs", () => {
    const salik = filterTollSource(charges, "salik");
    const darb = filterTollSource(charges, "darb");
    expect(salik.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(13.3);
    expect(darb.reduce((sum, row) => sum + row.amount, 0)).toBe(8);
    expect(darb.map((row) => row.id)).not.toContain("salik");
    expect([...salik, ...darb]).toHaveLength(charges.length);
  });
});
