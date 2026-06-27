import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ImportSummary {
  totalRows: number;
  imported: number;
  skippedZero: number;
  skippedDuplicate: number;
  unmatchedPlates: string[];
  errors: string[];
}

interface CarRow { id: string; plate: string; tag_number?: string | null; }
interface ContractRow { id: string; car_id: string; client_id: string; start_date: string; end_date: string; }
interface ContractVehicleRow { contract_id: string; car_id: string; started_at: string; ended_at: string | null; }
interface UnlinkedFineRow { id: string; car_id: string | null; fine_date: string; }
interface UnlinkedSalikRow { id: string; car_id: string | null; charge_date: string; }
interface LinkedFineRow { id: string; car_id: string | null; fine_date: string; contract_id: string | null; }
interface LinkedSalikRow { id: string; car_id: string | null; charge_date: string; contract_id: string | null; }
type ServiceFeeType = "fixed" | "percentage";
interface ProfileFeeSettings {
  fine_fee_type: ServiceFeeType | null;
  fine_fee_value: number | null;
  salik_fee_type: ServiceFeeType | null;
  salik_fee_value: number | null;
}
interface ImportFeeSettings {
  fine: { type: ServiceFeeType; value: number };
  salik: { type: ServiceFeeType; value: number };
}

interface ExtendedDatabase extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      contract_vehicles: {
        Row: ContractVehicleRow;
        Insert: ContractVehicleRow;
        Update: Partial<ContractVehicleRow>;
        Relationships: [];
      };
    };
  };
}

const extendedSupabase = supabase as SupabaseClient<ExtendedDatabase>;

const norm = (v: unknown) => String(v ?? "").trim();
// Match plates by digits only: "AJM A 11532" -> "11532" matches TAMM "11532"
const normPlate = (v: unknown) => norm(v).replace(/\D+/g, "");

function parseAmount(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  // Strip AED, currency symbols, spaces, commas — keep digits, dot, minus
  const s = String(v)
    .replace(/aed/gi, "")
    .replace(/[,\s\u00A0]/g, "")
    .replace(/[^\d.\-]/g, "")
    .trim();
  if (!s) return 0;
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function normalizeServiceFeeType(value: string | null | undefined): ServiceFeeType {
  return value === "percentage" ? "percentage" : "fixed";
}

function calculateServiceFee(baseAmount: number, type: ServiceFeeType, value: number): number {
  if (type === "percentage") {
    return Math.round((baseAmount * value / 100) * 100) / 100;
  }

  return value;
}

async function fetchImportFeeSettings(ownerId: string): Promise<{ data: ImportFeeSettings | null; error: string | null }> {
  const profiles = supabase.from("profiles") as unknown as {
    select: (columns: string) => {
      eq: (column: "id", value: string) => {
        maybeSingle: () => Promise<{ data: ProfileFeeSettings | null; error: { message: string } | null }>;
      };
    };
  };

  const { data, error } = await profiles
    .select("fine_fee_type, fine_fee_value, salik_fee_type, salik_fee_value")
    .eq("id", ownerId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data || data.fine_fee_value == null || data.salik_fee_value == null) {
    return { data: null, error: "Import service fee settings are missing from profile" };
  }

  return {
    data: {
      fine: {
        type: normalizeServiceFeeType(data?.fine_fee_type),
        value: data.fine_fee_value,
      },
      salik: {
        type: normalizeServiceFeeType(data?.salik_fee_type),
        value: data.salik_fee_value,
      },
    },
    error: null,
  };
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${d.y}-${mm}-${dd}`;
    }
  }
  const s = String(v).trim();
  // Try common formats: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/.exec(s);
  if (dmy) {
    let y = dmy[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseFineDateTime(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, Math.floor(d.S || 0)).toISOString();
    }
  }

  const s = String(v).trim();
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (ymd) {
    return new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      Number(ymd[4] || 0),
      Number(ymd[5] || 0),
      Number(ymd[6] || 0),
    ).toISOString();
  }

  const dmy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (dmy) {
    let year = dmy[3];
    if (year.length === 2) year = "20" + year;
    return new Date(
      Number(year),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      Number(dmy[4] || 0),
      Number(dmy[5] || 0),
      Number(dmy[6] || 0),
    ).toISOString();
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function readSheet(
  file: File,
  opts?: { raw?: boolean; headerMarker?: string },
): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const data = new Uint8Array(buf);
  const wb = XLSX.read(data, { type: "buffer", cellDates: true, raw: false });
  function getRawCellValue(ws: XLSX.WorkSheet, col: number, row: number): string {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = ws[cellAddress];
    if (!cell) return "";
    // Use raw numeric value if available, formatted string otherwise
    if (cell.t === "n" && cell.v !== undefined) return String(Math.round(cell.v));
    return String(cell.w ?? cell.v ?? "");
  }
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Read as 2D array so we can locate the real header row (Salik .xls files
  // often have a few title/preamble rows before the actual column headers).
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (!matrix.length) return [];

  const marker = (opts?.headerMarker || "").toLowerCase().trim();
  let headerIdx = 0;
  if (marker) {
    for (let i = 0; i < Math.min(matrix.length, 50); i++) {
      const row = matrix[i] || [];
      const hit = row.some((c) => String(c ?? "").toLowerCase().trim() === marker
        || String(c ?? "").toLowerCase().includes(marker));
      if (hit) { headerIdx = i; break; }
    }
  }

  const headers = (matrix[headerIdx] || []).map((h) => String(h ?? "").trim());
  const out: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (row.every((c) => c === "" || c == null)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const strVal = String(row[idx] ?? "");
      const value = strVal.includes("E+") || strVal.includes("e+")
        ? getRawCellValue(ws, idx, i)
        : strVal;
      obj[`__col_${XLSX.utils.encode_col(idx)}`] = value;
      if (h) {
        obj[h] = value;
      }
    });
    out.push(obj);
  }
  return out;
}

function getField(row: Record<string, unknown>, ...keys: string[]): unknown {
  const lower: Record<string, unknown> = {};
  for (const k of Object.keys(row)) lower[k.toLowerCase().trim()] = row[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase().trim()];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

function getDatePart(value: string): string {
  return value.slice(0, 10);
}

function matchesVehiclePeriod(
  vehicle: ContractVehicleRow,
  carId: string,
  dateIso: string,
  todayIso: string,
): boolean {
  const startedAt = getDatePart(vehicle.started_at);
  const endedAt = vehicle.ended_at ? getDatePart(vehicle.ended_at) : todayIso;
  return vehicle.car_id === carId && startedAt <= dateIso && endedAt >= dateIso;
}

function matchesContractVehicle(
  contractVehicles: ContractVehicleRow[],
  contractId: string,
  carId: string,
  dateIso: string,
): boolean {
  const todayIso = new Date().toISOString().slice(0, 10);
  return contractVehicles.some(
    (vehicle) => vehicle.contract_id === contractId && matchesVehiclePeriod(vehicle, carId, dateIso, todayIso),
  );
}

function findContract(
  contracts: ContractRow[],
  contractVehicles: ContractVehicleRow[],
  carId: string,
  dateIso: string,
): ContractRow | undefined {
  const todayIso = new Date().toISOString().slice(0, 10);
  const timelineVehicle = contractVehicles
    .filter((vehicle) => matchesVehiclePeriod(vehicle, carId, dateIso, todayIso))
    .sort((a, b) => getDatePart(b.started_at).localeCompare(getDatePart(a.started_at)))[0];

  if (timelineVehicle) {
    return contracts.find((contract) => contract.id === timelineVehicle.contract_id);
  }

  const contractsWithVehicleHistory = new Set(contractVehicles.map((vehicle) => vehicle.contract_id));
  return contracts.find(
    (c) => !contractsWithVehicleHistory.has(c.id)
      && c.car_id === carId
      && c.start_date <= dateIso
      && c.end_date >= dateIso,
  );
}

async function unlinkInvalidFineTimelineLinks(
  ownerId: string,
  contractVehicles: ContractVehicleRow[],
): Promise<string | null> {
  const contractsWithVehicleHistory = new Set(contractVehicles.map((vehicle) => vehicle.contract_id));
  if (!contractsWithVehicleHistory.size) return null;

  const { data, error } = await supabase
    .from("fines")
    .select("id, car_id, fine_date, contract_id")
    .eq("owner_id", ownerId)
    .not("contract_id", "is", null)
    .not("car_id", "is", null);

  if (error) return error.message;

  const updates = ((data || []) as LinkedFineRow[])
    .map((fine) => {
      if (!fine.car_id || !fine.contract_id || !contractsWithVehicleHistory.has(fine.contract_id)) return null;
      if (matchesContractVehicle(contractVehicles, fine.contract_id, fine.car_id, fine.fine_date)) return null;
      return supabase
        .from("fines")
        .update({ contract_id: null, client_id: null })
        .eq("id", fine.id)
        .eq("owner_id", ownerId)
        .eq("contract_id", fine.contract_id);
    })
    .filter(Boolean);

  const results = await Promise.all(updates);
  const updateError = results.find((result) => result.error)?.error;
  return updateError?.message ?? null;
}

async function unlinkInvalidSalikTimelineLinks(
  ownerId: string,
  contractVehicles: ContractVehicleRow[],
): Promise<string | null> {
  const contractsWithVehicleHistory = new Set(contractVehicles.map((vehicle) => vehicle.contract_id));
  if (!contractsWithVehicleHistory.size) return null;

  const { data, error } = await supabase
    .from("salik")
    .select("id, car_id, charge_date, contract_id")
    .eq("owner_id", ownerId)
    .not("contract_id", "is", null)
    .not("car_id", "is", null);

  if (error) return error.message;

  const updates = ((data || []) as LinkedSalikRow[])
    .map((charge) => {
      if (!charge.car_id || !charge.contract_id || !contractsWithVehicleHistory.has(charge.contract_id)) return null;
      if (matchesContractVehicle(contractVehicles, charge.contract_id, charge.car_id, charge.charge_date)) return null;
      return supabase
        .from("salik")
        .update({ contract_id: null, client_id: null })
        .eq("id", charge.id)
        .eq("owner_id", ownerId)
        .eq("contract_id", charge.contract_id);
    })
    .filter(Boolean);

  const results = await Promise.all(updates);
  const updateError = results.find((result) => result.error)?.error;
  return updateError?.message ?? null;
}

async function relinkUnlinkedFines(
  ownerId: string,
  contracts: ContractRow[],
  contractVehicles: ContractVehicleRow[],
): Promise<string | null> {
  const { data, error } = await supabase
    .from("fines")
    .select("id, car_id, fine_date")
    .eq("owner_id", ownerId)
    .is("contract_id", null)
    .not("car_id", "is", null);

  if (error) return error.message;

  const updates = ((data || []) as UnlinkedFineRow[])
    .map((fine) => {
      if (!fine.car_id) return null;
      const contract = findContract(contracts, contractVehicles, fine.car_id, fine.fine_date);
      if (!contract) return null;
      return supabase
        .from("fines")
        .update({ contract_id: contract.id, client_id: contract.client_id })
        .eq("id", fine.id)
        .eq("owner_id", ownerId)
        .is("contract_id", null);
    })
    .filter(Boolean);

  const results = await Promise.all(updates);
  const updateError = results.find((result) => result.error)?.error;
  return updateError?.message ?? null;
}

async function relinkUnlinkedSalik(
  ownerId: string,
  contracts: ContractRow[],
  contractVehicles: ContractVehicleRow[],
): Promise<string | null> {
  const { data, error } = await supabase
    .from("salik")
    .select("id, car_id, charge_date")
    .eq("owner_id", ownerId)
    .is("contract_id", null)
    .not("car_id", "is", null);

  if (error) return error.message;

  const updates = ((data || []) as UnlinkedSalikRow[])
    .map((charge) => {
      if (!charge.car_id) return null;
      const contract = findContract(contracts, contractVehicles, charge.car_id, charge.charge_date);
      if (!contract) return null;
      return supabase
        .from("salik")
        .update({ contract_id: contract.id, client_id: contract.client_id })
        .eq("id", charge.id)
        .eq("owner_id", ownerId)
        .is("contract_id", null);
    })
    .filter(Boolean);

  const results = await Promise.all(updates);
  const updateError = results.find((result) => result.error)?.error;
  return updateError?.message ?? null;
}

export async function importFinesExcel(file: File): Promise<ImportSummary> {
  const summary: ImportSummary = {
    totalRows: 0, imported: 0, skippedZero: 0, skippedDuplicate: 0,
    unmatchedPlates: [], errors: [],
  };
  const parsedRows = (await readSheet(file)).map((row) => ({ ...row, fineNumber: String(row["Fine Number"]) }));
  summary.totalRows = parsedRows.length;
  if (!parsedRows.length) return summary;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { summary.errors.push("Not authenticated"); return summary; }
  const { data: feeSettings, error: feeSettingsError } = await fetchImportFeeSettings(user.id);
  if (feeSettingsError || !feeSettings) {
    summary.errors.push(`Failed to load import service fees: ${feeSettingsError || "Unknown error"}`);
    return summary;
  }

  const [carsRes, contractsRes, contractVehiclesRes, existingRes] = await Promise.all([
    supabase.from("cars").select("id, plate"),
    supabase.from("contracts").select("id, car_id, client_id, start_date, end_date"),
    extendedSupabase.from("contract_vehicles").select("contract_id, car_id, started_at, ended_at"),
    supabase.from("fines").select("fine_number").not("fine_number", "is", null),
  ]);
  const loadError = carsRes.error || contractsRes.error || contractVehiclesRes.error || existingRes.error;
  if (loadError) { summary.errors.push(loadError.message); return summary; }

  const cars = (carsRes.data || []) as CarRow[];
  const contracts = (contractsRes.data || []) as ContractRow[];
  const contractVehicles = (contractVehiclesRes.data || []) as ContractVehicleRow[];
  const existingNumbers = new Set(((existingRes.data || []) as { fine_number: string }[]).map((r) => r.fine_number));
  const relinkError = await relinkUnlinkedFines(user.id, contracts, contractVehicles);
  if (relinkError) summary.errors.push(`Relink existing fines: ${relinkError}`);
  const unlinkError = await unlinkInvalidFineTimelineLinks(user.id, contractVehicles);
  if (unlinkError) summary.errors.push(`Unlink invalid fine timeline links: ${unlinkError}`);

  const carByPlate = new Map<string, CarRow>();
  for (const c of cars) carByPlate.set(normPlate(c.plate), c);

  const unmatched = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  const seenInBatch = new Set<string>();

  for (const row of parsedRows) {
    const fineNumber = norm(row.fineNumber);
    const plate = norm(getField(row, "Plate Number", "Plate"));
    const fineDateValue = getField(row, "Date", "Fine Date");
    const dateIso = parseDate(fineDateValue);
    const fineDateTimeIso = parseFineDateTime(fineDateValue);
    const source = norm(getField(row, "Source"));
    const fineType = norm(getField(row, "Fine Description", "Description")) || "Other";
    const amountRaw = getField(row, "__col_R", "Total Amount after Discount");
    const original = parseAmount(amountRaw);

    if (original === 0) { summary.skippedZero++; continue; }
    if (!dateIso || !fineDateTimeIso) { summary.errors.push(`Missing date for fine ${fineNumber || plate}`); continue; }

    if (fineNumber) {
      if (existingNumbers.has(fineNumber) || seenInBatch.has(fineNumber)) { summary.skippedDuplicate++; continue; }
      seenInBatch.add(fineNumber);
    }

    const car = carByPlate.get(normPlate(plate));
    if (!car) { unmatched.add(plate || "(blank)"); continue; }
    const contract = findContract(contracts, contractVehicles, car.id, dateIso);

    const serviceFee = calculateServiceFee(original, feeSettings.fine.type, feeSettings.fine.value);
    toInsert.push({
      owner_id: user.id,
      fine_number: fineNumber || null,
      fine_date: fineDateTimeIso,
      car_id: car.id,
      client_id: contract?.client_id ?? null,
      contract_id: contract?.id ?? null,
      fine_type: fineType,
      black_points: parseInt(String(row["Black Points"] ?? "0"), 10) || 0,
      source: source || "",
      original_amount: original,
      service_fee: serviceFee,
      amount: original + serviceFee,
      status: "Unpaid",
    });
  }

  if (toInsert.length) {
    const { error, data } = await supabase.from("fines").insert(toInsert as never).select("id");
    if (error) summary.errors.push(error.message);
    else summary.imported = data?.length ?? toInsert.length;
  }
  summary.unmatchedPlates = Array.from(unmatched);
  return summary;
}

export async function importSalikExcel(file: File): Promise<ImportSummary> {
  const summary: ImportSummary = {
    totalRows: 0, imported: 0, skippedZero: 0, skippedDuplicate: 0,
    unmatchedPlates: [], errors: [],
  };
  // Force string conversion for legacy .xls where Amount may be misread.
  // Salik exports often have title/preamble rows — locate the real header
  // by scanning for "Transaction ID".
  const rows = await readSheet(file, { raw: false, headerMarker: "Transaction ID" });
  summary.totalRows = rows.length;
  if (!rows.length) return summary;

  // Debug: inspect raw Amount values for the first few rows
  console.log("[Salik import] first 3 rows:", rows.slice(0, 3));

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { summary.errors.push("Not authenticated"); return summary; }
  const { data: feeSettings, error: feeSettingsError } = await fetchImportFeeSettings(user.id);
  if (feeSettingsError || !feeSettings) {
    summary.errors.push(`Failed to load import service fees: ${feeSettingsError || "Unknown error"}`);
    return summary;
  }

  const [carsRes, contractsRes, contractVehiclesRes, existingRes] = await Promise.all([
    supabase.from("cars").select("id, plate, tag_number"),
    supabase.from("contracts").select("id, car_id, client_id, start_date, end_date"),
    extendedSupabase.from("contract_vehicles").select("contract_id, car_id, started_at, ended_at"),
    supabase.from("salik").select("transaction_id").not("transaction_id", "is", null),
  ]);
  const loadError = carsRes.error || contractsRes.error || contractVehiclesRes.error || existingRes.error;
  if (loadError) { summary.errors.push(loadError.message); return summary; }

  const cars = (carsRes.data || []) as CarRow[];
  const contracts = (contractsRes.data || []) as ContractRow[];
  const contractVehicles = (contractVehiclesRes.data || []) as ContractVehicleRow[];
  const existingTx = new Set(((existingRes.data || []) as { transaction_id: string }[]).map((r) => r.transaction_id));
  const relinkError = await relinkUnlinkedSalik(user.id, contracts, contractVehicles);
  if (relinkError) summary.errors.push(`Relink existing Salik: ${relinkError}`);
  const unlinkError = await unlinkInvalidSalikTimelineLinks(user.id, contractVehicles);
  if (unlinkError) summary.errors.push(`Unlink invalid Salik timeline links: ${unlinkError}`);

  const carByPlate = new Map<string, CarRow>();
  const carByTag = new Map<string, CarRow>();
  for (const c of cars) {
    carByPlate.set(normPlate(c.plate), c);
    if (c.tag_number) carByTag.set(norm(c.tag_number), c);
  }

  const unmatched = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  const seenInBatch = new Set<string>();

  // Group by plate+date for trip counting
  for (const row of rows) {
    const txId = norm(getField(row, "Transaction ID", "TransactionId", "Transaction Id"));
    const plate = norm(getField(row, "Plate", "Plate Number"));
    const tagNumber = norm(getField(row, "Tag Number", "TagNumber"));
    const dateIso = parseDate(getField(row, "Trip Date", "Date"));
    const tollGate = norm(getField(row, "Toll Gate", "TollGate"));
    const direction = norm(getField(row, "Direction"));
    const original = parseAmount(getField(row, "Amount(AED)", "Amount (AED)", "Amount", "AMOUNT"));

    if (original === 0) { summary.skippedZero++; continue; }
    if (!dateIso) { summary.errors.push(`Missing date for txn ${txId || plate}`); continue; }

    if (txId) {
      if (existingTx.has(txId) || seenInBatch.has(txId)) { summary.skippedDuplicate++; continue; }
      seenInBatch.add(txId);
    }

    const car = (tagNumber && carByTag.get(tagNumber)) || carByPlate.get(normPlate(plate));
    if (!car) { unmatched.add(plate || tagNumber || "(blank)"); continue; }
    const contract = findContract(contracts, contractVehicles, car.id, dateIso);

    const serviceFee = calculateServiceFee(original, feeSettings.salik.type, feeSettings.salik.value);
    toInsert.push({
      owner_id: user.id,
      transaction_id: txId || null,
      tag_number: tagNumber || null,
      toll_gate: tollGate || null,
      direction: direction || null,
      charge_date: dateIso,
      car_id: car.id,
      client_id: contract?.client_id ?? null,
      contract_id: contract?.id ?? null,
      trips: 1,
      original_amount: original,
      service_fee: serviceFee,
      amount: original + serviceFee,
      status: "Unpaid",
    });
  }

  if (toInsert.length) {
    const { error, data } = await supabase.from("salik").insert(toInsert as never).select("id");
    if (error) summary.errors.push(error.message);
    else summary.imported = data?.length ?? toInsert.length;
  }
  summary.unmatchedPlates = Array.from(unmatched);
  return summary;
}
