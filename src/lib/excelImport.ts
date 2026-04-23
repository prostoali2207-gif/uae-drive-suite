import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export interface ImportSummary {
  totalRows: number;
  imported: number;
  skippedZero: number;
  skippedDuplicate: number;
  unmatchedPlates: string[];
  errors: string[];
}

interface CarRow { id: string; plate: string; }
interface ContractRow { id: string; car_id: string; client_id: string; start_date: string; end_date: string; }

const norm = (v: unknown) => String(v ?? "").trim();
const normPlate = (v: unknown) => norm(v).toUpperCase().replace(/\s+/g, "");

function parseAmount(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/aed/i, "").replace(/[^\d.\-]/g, "").trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
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

async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
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

function findContract(contracts: ContractRow[], carId: string, dateIso: string): ContractRow | undefined {
  return contracts.find(
    (c) => c.car_id === carId && c.start_date <= dateIso && c.end_date >= dateIso,
  );
}

export async function importFinesExcel(file: File): Promise<ImportSummary> {
  const summary: ImportSummary = {
    totalRows: 0, imported: 0, skippedZero: 0, skippedDuplicate: 0,
    unmatchedPlates: [], errors: [],
  };
  const rows = await readSheet(file);
  summary.totalRows = rows.length;
  if (!rows.length) return summary;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { summary.errors.push("Not authenticated"); return summary; }

  const [carsRes, contractsRes, existingRes] = await Promise.all([
    supabase.from("cars").select("id, plate"),
    supabase.from("contracts").select("id, car_id, client_id, start_date, end_date"),
    supabase.from("fines").select("fine_number").not("fine_number", "is", null),
  ]);
  const cars = (carsRes.data || []) as CarRow[];
  const contracts = (contractsRes.data || []) as ContractRow[];
  const existingNumbers = new Set(((existingRes.data || []) as { fine_number: string }[]).map((r) => r.fine_number));

  const carByPlate = new Map<string, CarRow>();
  for (const c of cars) carByPlate.set(normPlate(c.plate), c);

  const unmatched = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  const seenInBatch = new Set<string>();

  for (const row of rows) {
    const fineNumber = norm(getField(row, "Fine Number", "FineNumber", "Fine No"));
    const plate = norm(getField(row, "Plate Number", "Plate"));
    const dateIso = parseDate(getField(row, "Date", "Fine Date"));
    const source = norm(getField(row, "Source"));
    const fineType = norm(getField(row, "Fine Description", "Description")) || "Other";
    const amountRaw = getField(row, "Total Amount after Discount", "Amount", "Total Amount");
    const original = parseAmount(amountRaw);

    if (original === 0) { summary.skippedZero++; continue; }
    if (!dateIso) { summary.errors.push(`Missing date for fine ${fineNumber || plate}`); continue; }

    if (fineNumber) {
      if (existingNumbers.has(fineNumber) || seenInBatch.has(fineNumber)) { summary.skippedDuplicate++; continue; }
      seenInBatch.add(fineNumber);
    }

    const car = carByPlate.get(normPlate(plate));
    if (!car) { unmatched.add(plate || "(blank)"); continue; }
    const contract = findContract(contracts, car.id, dateIso);

    const serviceFee = 20;
    toInsert.push({
      owner_id: user.id,
      fine_number: fineNumber || null,
      fine_date: dateIso,
      car_id: car.id,
      client_id: contract?.client_id ?? null,
      contract_id: contract?.id ?? null,
      fine_type: fineType,
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
  const rows = await readSheet(file);
  summary.totalRows = rows.length;
  if (!rows.length) return summary;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { summary.errors.push("Not authenticated"); return summary; }

  const [carsRes, contractsRes, existingRes] = await Promise.all([
    supabase.from("cars").select("id, plate"),
    supabase.from("contracts").select("id, car_id, client_id, start_date, end_date"),
    supabase.from("salik").select("transaction_id").not("transaction_id", "is", null),
  ]);
  const cars = (carsRes.data || []) as CarRow[];
  const contracts = (contractsRes.data || []) as ContractRow[];
  const existingTx = new Set(((existingRes.data || []) as { transaction_id: string }[]).map((r) => r.transaction_id));

  const carByPlate = new Map<string, CarRow>();
  for (const c of cars) carByPlate.set(normPlate(c.plate), c);

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
    const original = parseAmount(getField(row, "Amount"));

    if (original === 0) { summary.skippedZero++; continue; }
    if (!dateIso) { summary.errors.push(`Missing date for txn ${txId || plate}`); continue; }

    if (txId) {
      if (existingTx.has(txId) || seenInBatch.has(txId)) { summary.skippedDuplicate++; continue; }
      seenInBatch.add(txId);
    }

    const car = carByPlate.get(normPlate(plate));
    if (!car) { unmatched.add(plate || tagNumber || "(blank)"); continue; }
    const contract = findContract(contracts, car.id, dateIso);

    const serviceFee = 1;
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
    const { error, data } = await supabase.from("salik").insert(toInsert).select("id");
    if (error) summary.errors.push(error.message);
    else summary.imported = data?.length ?? toInsert.length;
  }
  summary.unmatchedPlates = Array.from(unmatched);
  return summary;
}
