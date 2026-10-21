import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getClientDocumentPath } from "@/lib/clientDocuments";
import { generateContractPdf } from "@/lib/contractPdf";
import { toast } from "sonner";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

// The police portal may interpret 200 K as decimal bytes; leave safety margin.
const POLICE_JPEG_MAX = 195_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const CLIENT_BUCKET = "client-documents";
const VEHICLE_BUCKET = "vehicle-documents";

interface ExportClient {
  full_name: string;
  phone: string;
  nationality: string;
  client_type: string;
  emirates_id: string | null;
  passport_number: string | null;
  license_number: string | null;
  passport_photo_url: string | null;
  eid_front_url: string | null;
  eid_back_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
}

interface ExportCar {
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  mulkiya_pdf_path: string | null;
}

interface ExportContract {
  id: string;
  owner_id: string;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  initial_mileage: number;
  fuel_level: string;
  client_signature: string | null;
  manager_signature: string | null;
  clients: ExportClient | null;
  cars: ExportCar | null;
}

interface ZipFile {
  name: string;
  data: Uint8Array;
}

function put16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function put32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Standard, uncompressed ZIP: no new dependency and no external file service. */
export function buildPoliceZip(files: ZipFile[]): Blob {
  if (files.length === 0 || files.length > 100) throw new Error("Invalid export file count");
  const encoder = new TextEncoder();
  const local: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const file of files) {
    if (!file.name || file.name.includes("..") || file.name.includes("/") || file.name.includes("\\")) {
      throw new Error("Unsafe ZIP file name");
    }
    const filename = encoder.encode(file.name);
    const bytes = file.data;
    const checksum = crc32(bytes);
    const localHeader = new Uint8Array(30 + filename.length);
    const l = new DataView(localHeader.buffer);
    put32(l, 0, 0x04034b50);
    put16(l, 4, 20);
    put16(l, 6, 0x0800); // UTF-8 filenames
    put16(l, 8, 0); // STORE; image/pdf is already compressed
    put32(l, 14, checksum);
    put32(l, 18, bytes.byteLength);
    put32(l, 22, bytes.byteLength);
    put16(l, 26, filename.length);
    localHeader.set(filename, 30);
    local.push(localHeader, bytes);
    const header = new Uint8Array(46 + filename.length);
    const c = new DataView(header.buffer);
    put32(c, 0, 0x02014b50);
    put16(c, 4, 20);
    put16(c, 6, 20);
    put16(c, 8, 0x0800);
    put16(c, 10, 0);
    put32(c, 16, checksum);
    put32(c, 20, bytes.byteLength);
    put32(c, 24, bytes.byteLength);
    put16(c, 28, filename.length);
    put32(c, 42, offset);
    header.set(filename, 46);
    central.push(header);
    centralSize += header.length;
    offset += localHeader.length + bytes.byteLength;
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  put32(e, 0, 0x06054b50);
  put16(e, 8, files.length);
  put16(e, 10, files.length);
  put32(e, 12, centralSize);
  put32(e, 16, offset);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (let target = 1500; target >= 720; target = Math.round(target * 0.84)) {
    const scale = Math.min(1, target / Math.max(canvas.width, canvas.height));
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(canvas.width * scale));
    output.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = output.getContext("2d");
    if (!ctx) throw new Error("Image conversion is unavailable");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(canvas, 0, 0, output.width, output.height);
    for (const quality of [0.88, 0.76, 0.64, 0.52, 0.40]) {
      const result = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode JPG")), "image/jpeg", quality);
      });
      if (result.size < POLICE_JPEG_MAX) return result;
    }
  }
  throw new Error("The image cannot be reduced below 200 KB while preserving minimum resolution");
}

async function jpgPages(source: Blob, firstPageOnly = false): Promise<Blob[]> {
  if (source.size > MAX_SOURCE_BYTES) throw new Error("Document exceeds the 20 MB processing limit");
  const isPdf = source.type === "application/pdf" || (await source.slice(0, 5).text()) === "%PDF-";
  if (isPdf) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await source.arrayBuffer()) }).promise;
    try {
      const pageCount = firstPageOnly ? 1 : doc.numPages;
      if (pageCount > 12) throw new Error("Document has too many pages; review it manually");
      const pages: Blob[] = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("PDF canvas is unavailable");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        pages.push(await canvasToJpeg(canvas));
      }
      return pages;
    } finally {
      await doc.destroy();
    }
  }
  if (!source.type.startsWith("image/")) throw new Error("Unsupported document type: " + (source.type || "unknown"));
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image canvas is unavailable");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    return [await canvasToJpeg(canvas)];
  } finally {
    bitmap.close();
  }
}

async function storageFile(bucket: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Download failed for " + bucket + ": " + (error?.message || path));
  return data;
}

async function buildExport(contractId: string): Promise<{ file: Blob; warnings: string[] }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in to FleetDesk first");

  const { data, error } = await supabase
    .from("contracts")
    .select("id, owner_id, start_date, start_time, end_date, end_time, rate_type, rate_amount, total_amount, deposit_amount, initial_mileage, fuel_level, client_signature, manager_signature, clients(full_name, phone, nationality, client_type, emirates_id, passport_number, license_number, passport_photo_url, eid_front_url, eid_back_url, license_front_url, license_back_url), cars(plate, make, model, year, color, mulkiya_pdf_path)")
    .eq("id", contractId)
    .single();
  if (error || !data) throw new Error("Contract not available: " + (error?.message || contractId));
  // Supabase RLS is the authority for staff/owner visibility.
  const contract = data as unknown as ExportContract;
  if (!contract.clients || !contract.cars) throw new Error("Linked client or vehicle is missing");

  const files: ZipFile[] = [];
  const warnings: string[] = [];
  const add = async (name: string, blob: Blob, firstPageOnly = false) => {
    const converted = await jpgPages(blob, firstPageOnly);
    for (let index = 0; index < converted.length; index += 1) {
      const filename = converted.length === 1 ? name + ".jpg" : name + "_Page_" + (index + 1) + ".jpg";
      files.push({ name: filename, data: new Uint8Array(await converted[index].arrayBuffer()) });
    }
  };

  const clientDocs: Array<[string, string | null]> = [
    ["1-passport", contract.clients.passport_photo_url],
    ["emirates-id-front", contract.clients.eid_front_url],
    ["emirates-id-back", contract.clients.eid_back_url],
    ["2-driving-license", contract.clients.license_front_url],
    ["driving-license-back", contract.clients.license_back_url],
  ];
  for (const [label, storedUrl] of clientDocs) {
    if (!storedUrl) {
      if (label === "2-driving-license" || (label === "1-passport" && !contract.clients.eid_front_url)) {
        warnings.push("Missing " + label);
      }
      continue;
    }
    try {
      const path = getClientDocumentPath(storedUrl);
      if (!path) throw new Error("Invalid stored document path");
      await add(label, await storageFile(CLIENT_BUCKET, path));
    } catch (err) {
      warnings.push(label + ": " + (err instanceof Error ? err.message : "Conversion failed"));
    }
  }

  if (contract.cars.mulkiya_pdf_path) {
    try {
      await add("mulkiya", await storageFile(VEHICLE_BUCKET, contract.cars.mulkiya_pdf_path));
    } catch (err) {
      warnings.push("Mulkiya: " + (err instanceof Error ? err.message : "Conversion failed"));
    }
  } else {
    warnings.push("Missing Mulkiya");
  }

  let pdf: Blob | undefined;
  const savedPdf = await supabase.storage.from("contract-pdfs").download(contract.id + ".pdf");
  if (savedPdf.data && !savedPdf.error) {
    pdf = savedPdf.data;
  } else {
    try {
      const generated = await generateContractPdf(contract as Parameters<typeof generateContractPdf>[0], { returnBlob: true });
      if (generated instanceof Blob) pdf = generated;
    } catch (err) {
      warnings.push("Contract PDF: " + (err instanceof Error ? err.message : "Generation failed"));
    }
  }
  if (pdf) {
    try {
      // Police accepts one JPG for Contract Copy; use the first page only.
      await add("3-contract-copy", pdf, true);
    } catch (err) {
      warnings.push("Contract JPG: " + (err instanceof Error ? err.message : "Conversion failed"));
    }
  } else {
    warnings.push("Missing Contract Copy");
  }

  const info = [
    "AJMAN POLICE - DOCUMENT EXPORT",
    "Contract: CTR-" + contract.id.slice(0, 8).toUpperCase(),
    "Vehicle: " + contract.cars.make + " " + contract.cars.model + " / " + contract.cars.plate,
    "Renter: " + contract.clients.full_name,
    "Rental start: " + contract.start_date + " " + (contract.start_time || ""),
    "Rental end: " + contract.end_date + " " + (contract.end_time || ""),
    "Contract total (AED): " + contract.total_amount,
    "",
    "Every export file intended for police upload is JPG smaller than 195,000 bytes.",
    "Police portal accepts one JPG per upload. For multi-page PDFs select the appropriate page.",
    "The original full contract PDF remains in FleetDesk and is not part of this upload-only ZIP.",
    "Contract JPG represents its first page. Verify that the police requires this page before uploading.",
    "Document 1 / Document 2 mapping must be checked against police portal requirements.",
    "",
    "WARNINGS:",
    ...(warnings.length ? warnings.map((value) => "- " + value) : ["None"]),
  ].join("\n");
  files.push({ name: "README.txt", data: new TextEncoder().encode(info) });
  return { file: buildPoliceZip(files), warnings };
}

export function AjmanPoliceExportButton({ contractId, compact = false }: { contractId: string; compact?: boolean }) {
  const [working, setWorking] = useState(false);
  const download = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (working) return;
    setWorking(true);
    try {
      const { file, warnings } = await buildExport(contractId);
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Ajman_Police_CTR-" + contractId.slice(0, 8).toUpperCase() + ".zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      if (warnings.length) toast.warning("Exported with " + warnings.length + " warning(s). See README.txt");
      else toast.success("Ajman Police package downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ajman Police export failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Button
      type="button"
      size={compact ? "icon" : "sm"}
      variant="outline"
      className={compact ? "h-8 w-8" : "h-8 gap-2"}
      disabled={working}
      aria-label="Download Ajman Police document package"
      title="Download Ajman Police document package"
      onClick={download}
    >
      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {!compact && (working ? "Preparing..." : "Police ZIP")}
    </Button>
  );
}
