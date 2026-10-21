import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

interface PoliceDocument {
  name: string;
  blob: Blob;
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

async function preparePoliceDocuments(contractId: string): Promise<{ files: PoliceDocument[]; warnings: string[] }> {
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

  const files: PoliceDocument[] = [];
  const warnings: string[] = [];
  const add = async (name: string, blob: Blob, firstPageOnly = false) => {
    const converted = await jpgPages(blob, firstPageOnly);
    for (let index = 0; index < converted.length; index += 1) {
      const filename = converted.length === 1 ? name + ".jpg" : name + "_Page_" + (index + 1) + ".jpg";
      files.push({ name: filename, blob: converted[index] });
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

  return { files, warnings };
}

export function AjmanPoliceExportButton({ contractId, compact = false }: { contractId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [files, setFiles] = useState<PoliceDocument[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const openDocuments = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (preparing) return;
    setOpen(true);
    setPreparing(true);
    setFiles([]);
    setWarnings([]);
    setError(null);
    try {
      const prepared = await preparePoliceDocuments(contractId);
      setFiles(prepared.files);
      setWarnings(prepared.warnings);
      if (prepared.files.length === 0) setError("No documents could be prepared. Check the warnings below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Police documents could not be prepared");
    } finally {
      setPreparing(false);
    }
  };

  const downloadDocument = (document: PoliceDocument) => {
    // One download per explicit click: reliable even when the browser blocks multi-file downloads.
    const url = URL.createObjectURL(document.blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.name;
    anchor.rel = "noopener";
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <>
      <Button
        type="button"
        size={compact ? "icon" : "sm"}
        variant="outline"
        className={compact ? "h-8 w-8" : "h-8 gap-2"}
        disabled={preparing}
        aria-label="Police Documents"
        title="Police Documents"
        onClick={openDocuments}
      >
        {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {!compact && "Police Documents"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Police Documents · CTR-{contractId.slice(0, 8).toUpperCase()}</DialogTitle>
            <DialogDescription>
              Download each JPG directly for Ajman Police. No ZIP or extraction. Each prepared image is under 195 KB.
            </DialogDescription>
          </DialogHeader>
          {preparing && <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparing documents...</div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {files.length > 0 && (
            <div className="grid gap-2">
              {files.map((document) => (
                <div key={document.name} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs font-medium">{document.name}</p>
                    <p className="text-xs text-muted-foreground">{(document.blob.size / 1000).toFixed(1)} KB · JPG</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => downloadDocument(document)}
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm font-medium">Some documents need attention</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            </div>
          )}
          {files.length > 0 && <p className="text-xs text-muted-foreground">Check that the passport, licence and contract copy match the fields required by the police website before uploading.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
