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
});
