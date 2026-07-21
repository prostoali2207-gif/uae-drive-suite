import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/integrations/supabase/client";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ParkingImportSummary {
  totalRows: number;
  expectedCount: number | null;
  expectedAmount: number | null;
  foundAmount: number;
  imported: number;
  skippedDuplicate: number;
  unmatchedPlates: string[];
  unmatchedContracts: number;
  errors: string[];
}

type PdfTextItem = { str: string; transform: number[] };
type CarRow = { id: string; plate: string; tag_number: string | null };
type ContractRow = {
  id: string;
  car_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
};

type ParsedParking = {
  parkingDate: string;
  plate: string;
  tagNumber: string;
  location: string;
  zone: string | null;
  amount: number;
  sourceKey: string;
};

const normPlate = (value: unknown) => String(value ?? "").replace(/\D+/g, "");
const normTag = (value: unknown) => String(value ?? "").replace(/\D+/g, "");
const money = (value: string) => Number(value.replace(/,/g, ""));

function parseSalikDate(date: string, time: string, meridiem: string): string {
  const months: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const [, dd, mon, yyyy] = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(date) ?? [];
  let [hh, mm, ss] = time.split(":").map(Number);
  if (meridiem === "PM" && hh !== 12) hh += 12;
  if (meridiem === "AM" && hh === 12) hh = 0;
  const month = String(months[mon]).padStart(2, "0");
  return `${yyyy}-${month}-${dd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}+04:00`;
}

function pageLines(items: PdfTextItem[]): string[] {
  const rows = new Map<number, { x: number; text: string }[]>();
  for (const item of items) {
    const x = item.transform[4] ?? 0;
    const y = Math.round((item.transform[5] ?? 0) * 2) / 2;
    const row = rows.get(y) ?? [];
    row.push({ x, text: item.str });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((v) => v.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitLocation(location: string): { location: string; zone: string | null } {
  const normalized = location.replace(/\s+/g, " ").trim();
  const dash = normalized.lastIndexOf("- DXB");
  if (dash >= 0) return { location: normalized.slice(0, dash).trim(), zone: "DXB" };
  return { location: normalized, zone: null };
}

function parseParkingLine(line: string): ParsedParking | null {
  const match = /^(\d{2}-[A-Za-z]{3}-\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(AM|PM)\s+(\S+)\s+(\S+)\s+(.+?)\s+([\d,]+\.\d{2})$/.exec(line);
  if (!match) return null;
  const [, date, time, meridiem, plate, tagNumber, rawLocation, rawAmount] = match;
  if (!/parking/i.test(rawLocation)) return null;
  const parkingDate = parseSalikDate(date, time, meridiem);
  const amount = money(rawAmount);
  const { location, zone } = splitLocation(rawLocation);
  const sourceKey = [normPlate(plate), normTag(tagNumber), parkingDate, location.toLowerCase(), amount.toFixed(2)].join("|");
  return { parkingDate, plate, tagNumber, location, zone, amount, sourceKey };
}

function contractAt(contracts: ContractRow[], carId: string, parkingDate: string): ContractRow | undefined {
  const date = parkingDate.slice(0, 10);
  const time = parkingDate.slice(11, 19);
  return contracts.find((contract) => {
    if (contract.car_id !== carId || date < contract.start_date || date > contract.end_date) return false;
    if (date === contract.start_date && contract.start_time && time < contract.start_time.slice(0, 8)) return false;
    if (date === contract.end_date && contract.end_time && time > contract.end_time.slice(0, 8)) return false;
    return true;
  });
}

export async function importParkingPdf(file: File): Promise<ParkingImportSummary> {
  const summary: ParkingImportSummary = {
    totalRows: 0,
    expectedCount: null,
    expectedAmount: null,
    foundAmount: 0,
    imported: 0,
    skippedDuplicate: 0,
    unmatchedPlates: [],
    unmatchedContracts: 0,
    errors: [],
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    summary.errors.push("Not authenticated");
    return summary;
  }

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const parsed: ParsedParking[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = pageLines(content.items as PdfTextItem[]);
    const pageText = lines.join(" ");

    if (pageNumber === 1) {
      const countMatch = /Total Number of Parking\s+([\d,]+)/i.exec(pageText);
      const amountMatch = /Total Parking Amount\s*\(AED\)\s+([\d,]+\.\d{2})/i.exec(pageText);
      summary.expectedCount = countMatch ? Number(countMatch[1].replace(/,/g, "")) : null;
      summary.expectedAmount = amountMatch ? money(amountMatch[1]) : null;
    }

    for (const line of lines) {
      const parking = parseParkingLine(line);
      if (parking) parsed.push(parking);
    }
  }

  summary.totalRows = parsed.length;
  summary.foundAmount = parsed.reduce((sum, row) => sum + row.amount, 0);

  if (summary.expectedCount !== null && summary.expectedCount !== parsed.length) {
    summary.errors.push(`PDF says ${summary.expectedCount} parking charges, but ${parsed.length} were read`);
  }
  if (summary.expectedAmount !== null && Math.abs(summary.expectedAmount - summary.foundAmount) > 0.01) {
    summary.errors.push(`PDF parking total is AED ${summary.expectedAmount.toFixed(2)}, but read total is AED ${summary.foundAmount.toFixed(2)}`);
  }
  if (summary.errors.length) return summary;

  const [carsRes, contractsRes, existingRes] = await Promise.all([
    supabase.from("cars").select("id, plate, tag_number"),
    supabase.from("contracts").select("id, car_id, client_id, start_date, end_date, start_time, end_time"),
    (supabase as any).from("parking_charges").select("source_key"),
  ]);
  if (carsRes.error || contractsRes.error || existingRes.error) {
    summary.errors.push(carsRes.error?.message || contractsRes.error?.message || existingRes.error?.message || "Failed to load matching data");
    return summary;
  }

  const cars = (carsRes.data || []) as CarRow[];
  const contracts = (contractsRes.data || []) as ContractRow[];
  const existing = new Set(((existingRes.data || []) as { source_key: string }[]).map((row) => row.source_key));
  const carByPlate = new Map(cars.map((car) => [normPlate(car.plate), car]));
  const carByTag = new Map(cars.filter((car) => car.tag_number).map((car) => [normTag(car.tag_number), car]));
  const unmatched = new Set<string>();
  const batchKeys = new Set<string>();
  const inserts: Record<string, unknown>[] = [];

  for (const row of parsed) {
    if (existing.has(row.sourceKey) || batchKeys.has(row.sourceKey)) {
      summary.skippedDuplicate += 1;
      continue;
    }
    batchKeys.add(row.sourceKey);
    const car = carByTag.get(normTag(row.tagNumber)) ?? carByPlate.get(normPlate(row.plate));
    if (!car) {
      unmatched.add(row.plate);
      continue;
    }
    const contract = contractAt(contracts, car.id, row.parkingDate);
    if (!contract) summary.unmatchedContracts += 1;
    inserts.push({
      owner_id: user.id,
      car_id: car.id,
      client_id: contract?.client_id ?? null,
      contract_id: contract?.id ?? null,
      parking_date: row.parkingDate,
      plate_number: row.plate,
      tag_number: row.tagNumber,
      location: row.location,
      parking_zone: row.zone,
      amount: row.amount,
      status: "Unpaid",
      source: "Salik Statement PDF",
      source_key: row.sourceKey,
    });
  }

  if (inserts.length) {
    const { data, error } = await (supabase as any).from("parking_charges").insert(inserts).select("id");
    if (error) summary.errors.push(error.message);
    else summary.imported = data?.length ?? inserts.length;
  }
  summary.unmatchedPlates = [...unmatched];
  return summary;
}
