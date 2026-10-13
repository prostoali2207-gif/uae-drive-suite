import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserMock, upsertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: getUserMock }, from: fromMock },
}));

import { commitDarb, parseDarbText, previewDarb } from "./darbImport";

const header = "Transaction ID,Plate,Date,Time,Gate,Amount";
const line = (plate: string, at: string) =>
  `,${plate},2026-10-08,${at},Ghantout Entry Gate,4.00`;

type MockData = Record<string, unknown[]>;

function mockDatabase(data: MockData, existingIds: string[] = []) {
  fromMock.mockImplementation((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      like: vi.fn(() => query),
      range: vi.fn(async () => ({
        data: table === "salik" ? existingIds.map((transaction_id) => ({ transaction_id })) : [],
        error: null,
      })),
      upsert: upsertMock,
      maybeSingle: vi.fn(async () => ({ data: (data[table] ?? [])[0] ?? null, error: null })),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: data[table] ?? [], error: null }).then(resolve, reject),
    };
    return query;
  });
  upsertMock.mockImplementation((rows: unknown[]) => ({
    select: vi.fn(async () => ({
      data: rows.map((_, index) => ({ id: `saved-${index}` })),
      error: null,
    })),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null });
});

describe("Darb preview + commit safety", () => {
  const fixture: MockData = {
    profiles: [{ fine_fee_type: "fixed", fine_fee_value: 20, salik_fee_type: "fixed", salik_fee_value: 1 }],
    cars: [
      { id: "car-A", plate: "A 12345" },
      { id: "car-B", plate: "B 12345" },
    ],
    contracts: [{
      id: "contract-one",
      client_id: "client-one",
      car_id: "car-A",
      start_date: "2026-10-08",
      end_date: "2026-10-08",
      start_time: "11:00:00",
      end_time: "23:00:00",
    }],
    contract_vehicles: [{
      owner_id: "owner-1",
      contract_id: "contract-one",
      car_id: "car-A",
      started_at: "2026-10-08T11:00:00+04:00",
      ended_at: "2026-10-08T12:00:00+04:00",
    }],
    clients: [{ id: "client-one", full_name: "Test Client" }],
  };

  it("matches an Ajman-coded plate only within the actual replacement segment", async () => {
    mockDatabase(fixture);
    const parsed = parseDarbText([
      header,
      line("A AJMAN PRIVATE 12345", "11:45:46"),
      line("A AJMAN PRIVATE 12345", "12:30:23"),
      line("B AJMAN PRIVATE 12345", "11:45:46"),
    ].join("\n"));
    const preview = await previewDarb(parsed);
    expect(preview.map((row) => row.status)).toEqual(["ready", "unlinked", "unlinked"]);
    expect(preview[0].contractLabel).toBe("Test Client");
    expect(preview[1].contractLabel).toBeNull();
    expect(preview[2].carId).toBe("car-B");
  });

  it("uses percentage Salik fee setting for Darb totals in preview and commit", async () => {
    mockDatabase({
      ...fixture,
      profiles: [{ fine_fee_type: "fixed", fine_fee_value: 20, salik_fee_type: "percentage", salik_fee_value: 12.5 }],
    });
    const parsed = parseDarbText([header, line("A AJMAN PRIVATE 12345", "11:45:46")].join("\n"));
    const preview = await previewDarb(parsed);
    expect(preview[0]).toMatchObject({ amount: 4, serviceFee: 0.5, totalAmount: 4.5, status: "ready" });
    await commitDarb(preview);
    expect(upsertMock.mock.calls[0][0][0]).toMatchObject({
      original_amount: 4, service_fee: 0.5, amount: 4.5, status: "Unpaid",
    });
  });

  it("fails safely if the owner changes Salik fee setting after preview", async () => {
    mockDatabase(fixture);
    const parsed = parseDarbText([header, line("A AJMAN PRIVATE 12345", "11:45:46")].join("\n"));
    const preview = await previewDarb(parsed);
    mockDatabase({
      ...fixture,
      profiles: [{ fine_fee_type: "fixed", fine_fee_value: 20, salik_fee_type: "fixed", salik_fee_value: 2 }],
    });
    await expect(commitDarb(preview)).rejects.toThrow(/service fee settings changed/);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("never imports when company Salik fee settings are missing", async () => {
    mockDatabase({ ...fixture, profiles: [] });
    const parsed = parseDarbText([header, line("A AJMAN PRIVATE 12345", "11:45:46")].join("\n"));
    await expect(previewDarb(parsed)).rejects.toThrow(/service fee settings/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("does not permit repeated source rows or reimported transactions", async () => {
    mockDatabase(fixture);
    const parsed = parseDarbText([
      header,
      line("A AJMAN PRIVATE 12345", "11:45:46"),
      line("A AJMAN PRIVATE 12345", "11:45:46"),
      line("A AJMAN PRIVATE 12345", "11:46:46"),
    ].join("\n"));
    const firstKey = parsed[0].key;
    const result = await previewDarb(parsed);
    expect(result.map((row) => row.status)).toEqual(["ready", "invalid", "ready"]);

    mockDatabase(fixture, [firstKey]);
    const repeat = await previewDarb([parsed[0]]);
    expect(repeat[0].status).toBe("duplicate");
    const saved = await commitDarb(repeat);
    expect(saved.inserted).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("inserts only eligible charges, never updates existing paid rows and never auto-bills", async () => {
    mockDatabase(fixture);
    const parsed = parseDarbText([
      header,
      line("A AJMAN PRIVATE 12345", "11:45:46"),
      line("A AJMAN PRIVATE 12345", "12:30:23"),
    ].join("\n"));
    const preview = await previewDarb(parsed);
    const result = await commitDarb(preview);
    expect(result).toMatchObject({ inserted: 2, duplicate: 0, failed: 0 });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [savedRows, options] = upsertMock.mock.calls[0];
    expect(options).toEqual({ onConflict: "transaction_id,owner_id", ignoreDuplicates: true });
    expect(savedRows).toHaveLength(2);
    for (const charge of savedRows) {
      expect(charge).toMatchObject({
        owner_id: "owner-1",
        amount: 5,
        original_amount: 4,
        service_fee: 1,
        status: "Unpaid",
        contract_id: null,
        client_id: null,
      });
      expect(charge.transaction_id.startsWith("DARB:")).toBe(true);
    }
  });
});
