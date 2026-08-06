import { describe, expect, it } from "vitest";
import { findTimelineContract, vehicleBelongsToContractOnDate } from "./contractVehicleTimeline";

const oldContract = {
  id: "old",
  car_id: "car-1",
  client_id: "client-old",
  start_date: "2026-06-01",
  end_date: "2026-06-30",
};

describe("contract vehicle timeline", () => {
  it("does not extend an unfinished vehicle segment beyond its contract", () => {
    const vehicle = {
      contract_id: "old",
      car_id: "car-1",
      started_at: "2026-06-01T08:00:00+04:00",
      ended_at: null,
    };

    expect(vehicleBelongsToContractOnDate(oldContract, vehicle, "car-1", "2026-07-25")).toBe(false);
  });

  it("finds the real current contract after an old open-ended segment", () => {
    const currentContract = {
      id: "current",
      car_id: "car-1",
      client_id: "client-current",
      start_date: "2026-07-12",
      end_date: "2026-08-12",
    };
    const vehicles = [
      { contract_id: "old", car_id: "car-1", started_at: "2026-06-01T08:00:00+04:00", ended_at: null },
      { contract_id: "current", car_id: "car-1", started_at: "2026-07-12T08:00:00+04:00", ended_at: null },
    ];

    expect(findTimelineContract([oldContract, currentContract], vehicles, "car-1", "2026-07-25")?.id)
      .toBe("current");
  });

  it("keeps legacy contracts without vehicle history working", () => {
    expect(findTimelineContract([oldContract], [], "car-1", "2026-06-15")?.id).toBe("old");
  });

  it("does not assign a fine after a same-day vehicle replacement", () => {
    const contract = {
      id: "contract-1",
      car_id: "car-2",
      client_id: "client-1",
      start_date: "2026-07-14",
      end_date: "2026-08-14",
    };
    const oldVehicle = {
      contract_id: "contract-1",
      car_id: "car-1",
      started_at: "2026-07-14T22:00:00+04:00",
      ended_at: "2026-07-22T16:30:00+04:00",
    };

    expect(vehicleBelongsToContractOnDate(
      contract,
      oldVehicle,
      "car-1",
      "2026-07-22T17:43:30+04:00",
    )).toBe(false);
  });
});
