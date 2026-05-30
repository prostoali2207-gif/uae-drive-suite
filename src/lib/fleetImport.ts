import * as XLSX from "xlsx";

export interface ExistingCarForImport {
  plate: string | null;
}

export interface LegacyFleetImportRow {
  rowNumber: number;
  tag_number: string | null;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  status: "Available";
  insurance_expiry: null;
  mulkiya_expiry: null;
  ready: boolean;
  skipReason: string | null;
}

export interface LegacyFleetImportPreview {
  totalRows: number;
  rowsReady: number;
  duplicatePlates: number;
  missingRequiredData: number;
  skippedRows: number;
  rows: LegacyFleetImportRow[];
}

const norm = (value: unknown) => String(value ?? "").trim();
const normPlate = (value: unknown) => norm(value).replace(/\s+/g, " ").toLowerCase();

function getField(row: Record<string, unknown>, ...keys: string[]): string {
  const lower: Record<string, unknown> = {};
  for (const key of Object.keys(row)) lower[key.toLowerCase().trim()] = row[key];
  for (const key of keys) {
    const value = lower[key.toLowerCase().trim()];
    if (value !== undefined && value !== null && String(value).trim() !== "") return norm(value);
  }
  return "";
}

function parseYear(value: string): number | null {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  return year;
}

async function readWorkbookRows(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    blankrows: false,
  });
}

export async function previewLegacyFleetImport(
  file: File,
  existingCars: ExistingCarForImport[],
): Promise<LegacyFleetImportPreview> {
  const rows = await readWorkbookRows(file);
  const existingPlates = new Set(existingCars.map((car) => normPlate(car.plate)).filter(Boolean));
  const seenPlates = new Set<string>();

  const mappedRows = rows.map((row, index): LegacyFleetImportRow => {
    const plate = getField(row, "Plate Number", "Plate", "Plate No");
    const make = getField(row, "Make");
    const model = getField(row, "Model");
    const year = parseYear(getField(row, "Year"));
    const tagNumber = getField(row, "Tag Number", "Tag No", "Salik Tag");
    const plateKey = normPlate(plate);
    const duplicatePlate = Boolean(plateKey && (existingPlates.has(plateKey) || seenPlates.has(plateKey)));
    const missingRequired = !plate || !make || !model || year === null;

    if (plateKey) seenPlates.add(plateKey);

    return {
      rowNumber: index + 2,
      tag_number: tagNumber || null,
      plate,
      make,
      model,
      year,
      status: "Available",
      insurance_expiry: null,
      mulkiya_expiry: null,
      ready: !missingRequired && !duplicatePlate,
      skipReason: missingRequired ? "Missing required data" : duplicatePlate ? "Duplicate plate" : null,
    };
  });

  const duplicatePlates = mappedRows.filter((row) => row.skipReason === "Duplicate plate").length;
  const missingRequiredData = mappedRows.filter((row) => row.skipReason === "Missing required data").length;

  return {
    totalRows: mappedRows.length,
    rowsReady: mappedRows.filter((row) => row.ready).length,
    duplicatePlates,
    missingRequiredData,
    skippedRows: duplicatePlates + missingRequiredData,
    rows: mappedRows,
  };
}
