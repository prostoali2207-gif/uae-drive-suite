import { beforeEach, describe, expect, it, vi } from "vitest";

const { sheetRows, getUserMock, fromMock, upsertMock } = vi.hoisted(() => ({
  sheetRows: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("xlsx", () => ({
  read: () => ({ SheetNames: ["Fines"], Sheets: { Fines: {} } }),
  utils: {
    sheet_to_json: sheetRows,
    encode_col: (index: number) => String.fromCharCode(65 + index),
    encode_cell: ({ r, c }: { r: number; c: number }) => `${String.fromCharCode(65 + c)}${r + 1}`,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: getUserMock }, from: fromMock },
}));

import { importFinesExcel } from "./excelImport";

const profile = {
  fine_fee_type: "fixed", fine_fee_value: 20,
  salik_fee_type: "fixed", salik_fee_value: 1,
  darb_fee_type: "fixed", darb_fee_value: 1,
};

const fineNumber = "6263714918";
const file = { arrayBuffer: async () => new ArrayBuffer(1) } as File;
const imported = new Map<string, Record<string, unknown>>();

function setGovernmentExportAmount(amount: number) {
  sheetRows.mockReturnValue([
    ["Fine Number", "Plate Number", "Date", "Ticket Time", "Source", "Fine Description", "Total Amount after Discount"],
    [fineNumber, "A 12345", "2026-06-12", "12:00:00", "Abu Dhabi", "Speeding", String(amount)],
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  imported.clear();
  getUserMock.mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null });

  upsertMock.mockImplementation((rows: Record<string, unknown>[], options: { ignoreDuplicates?: boolean }) => ({
    select: async () => {
      const inserted: Array<{ id: string }> = [];
      for (const row of rows) {
        const key = `${row.owner_id}:${row.fine_number}`;
        if (options.ignoreDuplicates && imported.has(key)) continue;
        imported.set(key, { ...row, status: "Unpaid" });
        inserted.push({ id: key });
      }
      return { data: inserted, error: null };
    },
  }));

  fromMock.mockImplementation((table: string) => {
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      is: vi.fn(() => q),
      not: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
      upsert: upsertMock,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: table === "cars" ? [{ id: "car-1", plate: "A 12345" }] : [],
          error: null,
        }).then(resolve, reject),
    };
    return q;
  });
});

describe("fine government export re-import", () => {
  it("preserves the amount and Paid status after a discount expires", async () => {
    setGovernmentExportAmount(195);
    expect(await importFinesExcel(file)).toMatchObject({ imported: 1, skippedDuplicate: 0, errors: [] });
    const key = `owner-1:${fineNumber}`;
    expect(imported.get(key)).toMatchObject({
      original_amount: 195, service_fee: 20, amount: 215,
    });

    imported.get(key)!.status = "Paid"; // Client pays AED 215.
    setGovernmentExportAmount(225); // Government removes AED 30 discount.
    expect(await importFinesExcel(file)).toMatchObject({ imported: 0, skippedDuplicate: 1, errors: [] });

    expect(imported.get(key)).toMatchObject({
      original_amount: 195, service_fee: 20, amount: 215, status: "Paid",
    });
    expect(upsertMock).toHaveBeenLastCalledWith(
      [expect.objectContaining({ fine_number: fineNumber, amount: 245 })],
      { onConflict: "owner_id,fine_number", ignoreDuplicates: true },
    );
  });

  it("still imports a new fine at the current government price", async () => {
    setGovernmentExportAmount(225);
    const summary = await importFinesExcel(file);
    expect(summary).toMatchObject({ imported: 1, skippedDuplicate: 0, errors: [] });
    expect(imported.get(`owner-1:${fineNumber}`)).toMatchObject({
      original_amount: 225, service_fee: 20, amount: 245,
    });
  });
});
