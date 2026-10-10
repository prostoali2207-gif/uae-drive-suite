import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { parseDarbText } from "./darbImport";

const headers = "Transaction ID,Plate,Date,Time,Gate,Amount";

describe("Darb canonical import format", () => {
  it("keeps a stable source-prefixed ID and valid crossing fields", () => {
    const [row] = parseDarbText(`${headers}\nAB123,C 77108,2026-10-08,07:45,Al Maqtaa,4.00`);
    expect(row.error).toBeUndefined();
    expect(row.key).toBe("DARB:C77108:AB123");
    expect(row.amount).toBe(4);
    expect(row.time).toBe("07:45");
  });

  it("derives a deterministic ID when Darb does not show one", () => {
    const input = `${headers}\n,C 77108,2026-10-08,07:45:36,Al Maqtaa,4`;
    expect(parseDarbText(input)[0].key).toBe(parseDarbText(input)[0].key);
    expect(parseDarbText(input)[0].key).toContain("DARB:AUTO:");
  });

  it("preserves leading zeros and quoted commas in canonical CSV", () => {
    const [row] = parseDarbText(`${headers}\r\n,00123,2026-10-08,07:45:36,"Gate, East",4.00`);
    expect(row.plate).toBe("00123");
    expect(row.gate).toBe("Gate, East");
    expect(row.error).toBeUndefined();
  });

  it("rejects minute-only time when original ID is absent", () => {
    const [row] = parseDarbText(`${headers}\\n,C 77108,2026-10-08,07:45,Al Maqtaa,4`);
    expect(row.error).toContain("HH:mm:ss required");
  });

  it("accepts seconds when the source ID is unavailable", () => {
    const [row] = parseDarbText(`${headers}\\n,C 77108,2026-10-08,07:45:36,Al Maqtaa,4`);
    expect(row.error).toBeUndefined();
    expect(row.time).toBe("07:45:36");
  });

  it("rejects a missing exact crossing time", () => {
    const [row] = parseDarbText(`${headers}\nAB124,C 77108,2026-10-08,,Al Maqtaa,4`);
    expect(row.error).toContain("invalid time");
  });

  it("rejects nonexistent dates and invalid monetary amounts", () => {
    const [row] = parseDarbText(`${headers}\nAB125,C 77108,2026-02-30,11:20,Al Maqtaa,-4`);
    expect(row.error).toContain("invalid date");
    expect(row.error).toContain("invalid positive");
  });

  it("rejects changed input headers instead of guessing mapping", () => {
    expect(() => parseDarbText("Car,When,Charge\n77108,2026-10-08,4"))
      .toThrow(/Invalid Darb format/);
  });
});
