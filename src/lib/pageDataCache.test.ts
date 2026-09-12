// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPageCache, writePageCache } from "./pageDataCache";

describe("pageDataCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("round-trips cached page data for the same user", () => {
    writePageCache("contracts", "user-a", { rows: [1, 2, 3] });

    expect(readPageCache<{ rows: number[] }>("contracts", "user-a")).toEqual({
      rows: [1, 2, 3],
    });
  });

  it("keeps cached data isolated between users", () => {
    writePageCache("contracts", "user-a", { rows: ["A"] });
    writePageCache("contracts", "user-b", { rows: ["B"] });

    expect(readPageCache<{ rows: string[] }>("contracts", "user-a")?.rows).toEqual(["A"]);
    expect(readPageCache<{ rows: string[] }>("contracts", "user-b")?.rows).toEqual(["B"]);
  });

  it("drops expired cached data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T10:00:00Z"));
    writePageCache("fleet", "user-a", { rows: [1] });

    vi.setSystemTime(new Date("2026-09-12T10:31:00Z"));

    expect(readPageCache("fleet", "user-a")).toBeNull();
  });

  it("treats malformed storage as a cache miss", () => {
    window.localStorage.setItem("fleetdesk:page-cache:v1:user-a:clients", "{bad-json");

    expect(readPageCache("clients", "user-a")).toBeNull();
  });
});
