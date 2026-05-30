import * as XLSX from "xlsx";

export type LegacyClientType = "Resident" | "Tourist";

export interface ExistingClientForImport {
  phone: string | null;
}

export interface LegacyClientImportRow {
  rowNumber: number;
  full_name: string;
  phone: string;
  email: string | null;
  nationality: string;
  client_type: LegacyClientType;
  emirates_id: string | null;
  passport_number: string | null;
  license_number: string;
  license_expiry: null;
  emirates_id_expiry: null;
  passport_expiry: null;
  ready: boolean;
  skipReason: string | null;
}

export interface LegacyClientImportPreview {
  totalRows: number;
  residents: number;
  tourists: number;
  missingDocuments: number;
  duplicatesByPhone: number;
  rowsReady: number;
  skippedMissingRequired: number;
  rows: LegacyClientImportRow[];
}

const norm = (value: unknown) => String(value ?? "").trim();
const normPhone = (value: unknown) => norm(value).replace(/\s+/g, "");

function getField(row: Record<string, unknown>, ...keys: string[]): string {
  const lower: Record<string, unknown> = {};
  for (const key of Object.keys(row)) lower[key.toLowerCase().trim()] = row[key];
  for (const key of keys) {
    const value = lower[key.toLowerCase().trim()];
    if (value !== undefined && value !== null && String(value).trim() !== "") return norm(value);
  }
  return "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function detectClientType(documentNumber: string): LegacyClientType {
  return documentNumber.startsWith("784") ? "Resident" : "Tourist";
}

async function readCsvRows(file: File): Promise<Record<string, unknown>[]> {
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

export async function previewLegacyClientImport(
  file: File,
  existingClients: ExistingClientForImport[],
): Promise<LegacyClientImportPreview> {
  const rows = await readCsvRows(file);
  const existingPhones = new Set(existingClients.map((client) => normPhone(client.phone)).filter(Boolean));
  const seenPhones = new Set<string>();

  const mappedRows = rows.map((row, index): LegacyClientImportRow => {
    const fullName = getField(row, "Name");
    const phone = normPhone(getField(row, "Mobile No.", "Mobile No", "Mobile", "Phone"));
    const emailRaw = getField(row, "Email");
    const nationality = getField(row, "Nationality");
    const documentNumber = getField(
      row,
      "Passport/Emirates ID Number",
      "Passport / Emirates ID Number",
      "Passport Emirates ID Number",
      "ID Number",
    );
    const clientType = detectClientType(documentNumber);
    const duplicatePhone = Boolean(phone && (existingPhones.has(phone) || seenPhones.has(phone)));
    const missingRequired = !fullName || !phone;

    if (phone) seenPhones.add(phone);

    return {
      rowNumber: index + 2,
      full_name: fullName,
      phone,
      email: emailRaw && isValidEmail(emailRaw) ? emailRaw : null,
      nationality,
      client_type: clientType,
      emirates_id: clientType === "Resident" && documentNumber ? documentNumber : null,
      passport_number: clientType === "Tourist" && documentNumber ? documentNumber : null,
      license_number: "",
      license_expiry: null,
      emirates_id_expiry: null,
      passport_expiry: null,
      ready: !missingRequired && !duplicatePhone,
      skipReason: missingRequired ? "Missing full name or phone" : duplicatePhone ? "Duplicate phone" : null,
    };
  });

  return {
    totalRows: mappedRows.length,
    residents: mappedRows.filter((row) => row.client_type === "Resident").length,
    tourists: mappedRows.filter((row) => row.client_type === "Tourist").length,
    missingDocuments: mappedRows.filter((row) => !row.emirates_id && !row.passport_number).length,
    duplicatesByPhone: mappedRows.filter((row) => row.skipReason === "Duplicate phone").length,
    rowsReady: mappedRows.filter((row) => row.ready).length,
    skippedMissingRequired: mappedRows.filter((row) => row.skipReason === "Missing full name or phone").length,
    rows: mappedRows,
  };
}
