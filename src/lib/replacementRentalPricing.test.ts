import { describe, expect, it } from "vitest";
import { buildReplacementBillingPeriods } from "./replacementRentalPricing";

describe("buildReplacementBillingPeriods", () => {
  const contract = {
    id: "contract-1",
    start_date: "2026-08-21",
    end_date: "2026-09-07",
  };

  it("keeps an unextended contract as one base billing period", () => {
    expect(buildReplacementBillingPeriods(contract, [])).toEqual([
      {
        id: "contract-1",
        type: "contract",
        billingId: "contract-1",
        start: "2026-08-21",
        end: "2026-09-07",
      },
    ]);
  });

  it("ends the base period at the first extension and maps the extension to its separate charge", () => {
    const periods = buildReplacementBillingPeriods(contract, [
      {
        id: "marker-1",
        label: "Rental Extension: 2026-08-28 - 2026-09-07",
        amount: 0,
        extension_start: "2026-08-28",
        extension_end: "2026-09-07",
        created_at: "2026-09-05T09:17:11Z",
      },
      {
        id: "charge-1",
        label: "Rent Extension #1",
        amount: 1200,
        extension_start: null,
        extension_end: null,
        created_at: "2026-09-05T09:17:11Z",
      },
    ]);

    expect(periods).toEqual([
      {
        id: "contract-1",
        type: "contract",
        billingId: "contract-1",
        start: "2026-08-21",
        end: "2026-08-28",
      },
      {
        id: "marker-1",
        type: "fee",
        billingId: "charge-1",
        start: "2026-08-28",
        end: "2026-09-07",
        extensionNumber: 1,
      },
    ]);
  });

  it("maps multiple extension markers to Rent Extension numbers in chronological order", () => {
    const periods = buildReplacementBillingPeriods(
      { ...contract, end_date: "2026-10-07" },
      [
        {
          id: "marker-2",
          label: "Rental Extension: 2026-09-07 - 2026-10-07",
          amount: 0,
          extension_start: "2026-09-07",
          extension_end: "2026-10-07",
          created_at: "2026-09-06T00:00:00Z",
        },
        {
          id: "charge-2",
          label: "Rent Extension #2",
          amount: 3000,
          extension_start: null,
          extension_end: null,
        },
        {
          id: "marker-1",
          label: "Rental Extension: 2026-08-28 - 2026-09-07",
          amount: 0,
          extension_start: "2026-08-28",
          extension_end: "2026-09-07",
          created_at: "2026-08-27T00:00:00Z",
        },
        {
          id: "charge-1",
          label: "Rent Extension #1",
          amount: 1200,
          extension_start: null,
          extension_end: null,
        },
      ],
    );

    expect(periods.map((period) => [period.type, period.billingId, period.start, period.end])).toEqual([
      ["contract", "contract-1", "2026-08-21", "2026-08-28"],
      ["fee", "charge-1", "2026-08-28", "2026-09-07"],
      ["fee", "charge-2", "2026-09-07", "2026-10-07"],
    ]);
  });

  it("never turns a zero-value extension marker into a financial charge when the separate charge is missing", () => {
    const periods = buildReplacementBillingPeriods(contract, [
      {
        id: "marker-1",
        label: "Rental Extension: 2026-08-28 - 2026-09-07",
        amount: 0,
        extension_start: "2026-08-28",
        extension_end: "2026-09-07",
      },
    ]);

    expect(periods[1].billingId).toBeNull();
  });

  it("supports legacy extension rows that still carry their own non-zero charge", () => {
    const periods = buildReplacementBillingPeriods(contract, [
      {
        id: "legacy-marker",
        label: "Rental Extension: 2026-08-28 - 2026-09-07",
        amount: 1200,
        extension_start: "2026-08-28",
        extension_end: "2026-09-07",
      },
    ]);

    expect(periods[1].billingId).toBe("legacy-marker");
  });
});
