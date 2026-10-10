import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const REQUIRED_HEADERS = ["Plate", "Date", "Time", "Gate", "Amount"] as const;
const EXPECTED_HEADERS = ["Transaction ID", ...REQUIRED_HEADERS] as const;

export interface DarbRow {
  line: number;
  key: string;
  plate: string;
  date: string;
  time: string;
  gate: string;
  amount: number;
  error?: string;
}

export interface DarbPreviewRow extends DarbRow {
  status: "ready" | "unlinked" | "duplicate" | "invalid";
  carId: string | null;
  contractLabel: string | null;
  message: string;
}

export interface DarbImportResult {
  inserted: number;
  duplicate: number;
  failed: number;
  errors: string[];
}

function normalizePlate(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Darb reports "A AJMAN PRIVATE 73230"; FleetDesk stores "A 73230".
// Only strip this verified Ajman/private qualifier, never match by digits alone.
export function fleetPlateKey(s: string): string {
  const plate = s.toUpperCase().trim().replace(/\s+/g, " ");
  const darbAjman = /^([A-Z0-9]+) AJMAN PRIVATE (\d+)$/.exec(plate);
  return normalizePlate(darbAjman ? darbAjman[1] + darbAjman[2] : plate);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function parseCsvMatrix(text: string): string[][] {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else if (!quoted && cell === "") quoted = true;
      else if (quoted) quoted = false;
      else throw new Error("Invalid CSV quoting.");
    } else if (char === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((item) => item.trim())) matrix.push(row);
      row = []; cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("Unclosed quoted field in Darb CSV.");
  row.push(cell);
  if (row.some((item) => item.trim())) matrix.push(row);
  return matrix;
}

function readRows(matrix: (string | number)[][]): DarbRow[] {
  if (matrix.length === 0) throw new Error("The Darb file is empty.");
  const header = matrix[0].map((v) => String(v).replace(/^\uFEFF/, "").trim());
  const missing = REQUIRED_HEADERS.filter((name) => !header.includes(name));
  if (missing.length) {
    throw new Error(`Invalid Darb format. Missing: ${missing.join(", ")}. Required columns: ${EXPECTED_HEADERS.join(", ")}.`);
  }
  const field = (row: (string | number)[], name: string) =>
    String(row[header.indexOf(name)] ?? "").trim();
  return matrix.slice(1).map((cells, index) => {
    const plate = field(cells, "Plate");
    const date = field(cells, "Date");
    const time = field(cells, "Time");
    const gate = field(cells, "Gate");
    const externalId = field(cells, "Transaction ID");
    const amountString = field(cells, "Amount").replace(/^(AED\s*)/i, "").replace(/,/g, "");
    const amount = Number(amountString);
    const errors: string[] = [];
    if (!plate || !normalizePlate(plate)) errors.push("missing plate");
    if (!isValidDate(date)) errors.push("invalid date (use YYYY-MM-DD)");
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) errors.push("invalid time (use HH:mm or HH:mm:ss)");
    if (!externalId && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) {
      errors.push("exact HH:mm:ss required without Transaction ID");
    }
    if (!gate) errors.push("missing gate");
    if (!amountString || !Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
      errors.push("invalid positive AED amount");
    }
    // Canonical source prefix prevents collisions with Salik transaction IDs.
    // A source transaction ID is preferred; otherwise all identifying fields form the key.
    const key = externalId
      ? `DARB:${normalizePlate(plate)}:${externalId}`
      : `DARB:AUTO:${normalizePlate(plate)}:${date}:${time}:${gate.toUpperCase().trim()}:${amount.toFixed(2)}`;
    return { line: index + 2, key, plate, date, time, gate, amount, error: errors.join("; ") || undefined };
  });
}

export function parseDarbText(text: string): DarbRow[] {
  return readRows(parseCsvMatrix(text));
}

export async function parseDarbFile(file: File): Promise<DarbRow[]> {
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error("Use .csv, .xlsx or .xls.");
  if (/\.csv$/i.test(file.name)) return parseDarbText(await file.text());
  const data = await file.arrayBuffer();
  const book = XLSX.read(new Uint8Array(data), { type: "array", raw: false });
  const sheet = book.Sheets[book.SheetNames[0]];
  return readRows(XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1, blankrows: false, defval: "", raw: false,
  }));
}

type Car = { id: string; plate: string };
type Contract = { id: string; client_id: string; car_id: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null };
type Segment = { contract_id: string; car_id: string; started_at: string; ended_at: string | null };
type Client = { id: string; full_name: string };
type BaseSalik = Database["public"]["Tables"]["salik"];
interface DarbDatabase extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      contract_vehicles: {
        Row: Segment;
        Insert: Segment;
        Update: Partial<Segment>;
        Relationships: [];
      };
      salik: BaseSalik & {
        Row: BaseSalik["Row"] & { trip_time: string | null };
        Insert: BaseSalik["Insert"] & { trip_time?: string | null };
        Update: BaseSalik["Update"] & { trip_time?: string | null };
      };
    };
  };
}
const extendedSupabase = supabase as SupabaseClient<DarbDatabase>;

function atDubai(date: string, time: string): number {
  const hhmmss = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  return Date.parse(`${date}T${hhmmss}+04:00`);
}
function isInContract(c: Contract, at: number): boolean {
  const start = atDubai(c.start_date, c.start_time || "00:00:00");
  const end = atDubai(c.end_date, c.end_time || "23:59:59");
  return at >= start && at <= end;
}

export async function previewDarb(rows: DarbRow[]): Promise<DarbPreviewRow[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sign in to import Darb transactions.");
  const [carsResult, contractsResult, segmentsResult, clientsResult] = await Promise.all([
    supabase.from("cars").select("id, plate").eq("owner_id", user.id),
    supabase.from("contracts").select("id, client_id, car_id, start_date, end_date, start_time, end_time").eq("owner_id", user.id),
    extendedSupabase.from("contract_vehicles").select("contract_id, car_id, started_at, ended_at").eq("owner_id", user.id),
    supabase.from("clients").select("id, full_name").eq("owner_id", user.id),
  ]);
  const loadError = carsResult.error || contractsResult.error || segmentsResult.error || clientsResult.error;
  if (loadError) throw new Error(loadError.message);
  const cars = (carsResult.data ?? []) as Car[];
  const contracts = (contractsResult.data ?? []) as Contract[];
  const segments = (segmentsResult.data ?? []) as Segment[];
  const clients = (clientsResult.data ?? []) as Client[];
  const byClient = new Map(clients.map((client) => [client.id, client.full_name]));
  const hasSegments = new Set(segments.map((segment) => segment.contract_id));
  const seen = new Set<string>();
  const existing = new Set<string>();
  // Paginate: Supabase returns a maximum of 1000 rows by default.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("salik")
      .select("transaction_id").eq("owner_id", user.id)
      .like("transaction_id", "DARB:%").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const record of data ?? []) if (record.transaction_id) existing.add(record.transaction_id);
    if ((data ?? []).length < 1000) break;
  }
  return rows.map((row) => {
    const base = { ...row, carId: null, contractLabel: null };
    if (row.error) return { ...base, status: "invalid" as const, message: row.error };
    if (seen.has(row.key)) {
      return { ...base, status: "invalid" as const, message: "Repeated identical crossing without a unique ID; verify source rows" };
    }
    if (existing.has(row.key)) {
      return { ...base, status: "duplicate" as const, message: "Already imported — will not overwrite existing charge" };
    }
    seen.add(row.key);
    // Exact plate is preferred. Numeric-only fallback is allowed only for a unique fleet match.
    const matches = cars.filter((car) => fleetPlateKey(car.plate) === fleetPlateKey(row.plate));
    if (matches.length !== 1) {
      return { ...base, status: "invalid" as const, message: matches.length ? "Ambiguous plate — check fleet" : "Plate does not exactly match FleetDesk — verify emirate, type and code" };
    }
    const car = matches[0];
    const timestamp = atDubai(row.date, row.time);
    const candidates = contracts.filter((contract) => isInContract(contract, timestamp) &&
      (hasSegments.has(contract.id)
        ? segments.some((seg) => seg.contract_id === contract.id && seg.car_id === car.id
          && timestamp >= Date.parse(seg.started_at)
          && timestamp <= Math.min(seg.ended_at ? Date.parse(seg.ended_at) : Infinity,
            atDubai(contract.end_date, contract.end_time || "23:59:59")))
        : contract.car_id === car.id));
    if (candidates.length > 1) {
      return { ...base, carId: car.id, status: "invalid" as const, message: "Overlapping contracts — manual review required" };
    }
    if (!candidates.length) {
      return { ...base, carId: car.id, status: "unlinked" as const, message: "No rental at crossing time; will remain unlinked" };
    }
    const linked = candidates[0];
    return {
      ...base, carId: car.id, status: "ready" as const,
      contractLabel: byClient.get(linked.client_id) ?? linked.id.slice(0, 8),
      message: "Matched by vehicle and exact crossing time",
    };
  });
}

export async function commitDarb(preview: DarbPreviewRow[]): Promise<DarbImportResult> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sign in to import Darb transactions.");
  const eligible = preview.filter((row) => (row.status === "ready" || row.status === "unlinked") && row.carId);
  const result: DarbImportResult = { inserted: 0, duplicate: preview.filter((row) => row.status === "duplicate").length, failed: 0, errors: [] };
  // Ignore existing IDs on conflict. NEVER update an existing charge/payment.
  for (let start = 0; start < eligible.length; start += 100) {
    const batch = eligible.slice(start, start + 100).map((row) => ({
      owner_id: user.id,
      transaction_id: row.key,
      charge_date: row.date,
      trip_time: row.time,
      toll_gate: `Darb — ${row.gate}`,
      car_id: row.carId,
      tag_number: null,
      trips: 1,
      original_amount: row.amount,
      service_fee: 0,
      amount: row.amount,
      status: "Unpaid",
      contract_id: null,
      client_id: null,
    }));
    const { data, error } = await extendedSupabase.from("salik")
      .upsert(batch, { onConflict: "transaction_id,owner_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      result.failed += batch.length;
      result.errors.push(`Rows ${eligible[start].line}–${eligible[start + batch.length - 1].line}: ${error.message}`);
    } else {
      const inserted = data?.length ?? 0;
      result.inserted += inserted;
      result.duplicate += batch.length - inserted;
    }
  }
  return result;
}

export const DARB_HEADERS = EXPECTED_HEADERS.join(",");
