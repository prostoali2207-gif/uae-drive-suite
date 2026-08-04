import { PDFDocument } from "pdf-lib";
import { type ApiRequest, type ApiResponse, requireFleetDeskUser } from "./_browser-agent.js";

export const config = { maxDuration: 120 };

const VEHICLE_DOCUMENTS_BUCKET = "vehicle-documents";

type TammPayload = {
  action?: "targets" | "upload";
  carId?: string;
  pdfBase64?: string;
  imageDataUrls?: string[];
};

type FleetCar = {
  id: string;
  plate: string;
  status: string;
  mulkiya_pdf_path: string | null;
};

const readBearerToken = (request: ApiRequest) => {
  const raw = request.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
};

const normalizePlate = (value: string) =>
  value.toUpperCase().replace(/AJMAN|AJM/g, "").replace(/[^A-Z0-9]/g, "");

const getSupabaseConfig = (request: ApiRequest) => {
  const token = readBearerToken(request);
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) throw new Error("FleetDesk authentication is unavailable");
  return { token, url, anonKey };
};

async function getCurrentUserId(request: ApiRequest) {
  const { token, url, anonKey } = getSupabaseConfig(request);
  const response = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } });
  if (!response.ok) throw new Error("Could not identify the FleetDesk user");
  const user = (await response.json()) as { id?: string };
  if (!user.id) throw new Error("FleetDesk user ID is missing");
  return user.id;
}

async function getActiveFleetCars(request: ApiRequest): Promise<FleetCar[]> {
  const { token, url, anonKey } = getSupabaseConfig(request);
  const params = new URLSearchParams({ select: "id,plate,status,mulkiya_pdf_path", status: "neq.Sold", order: "plate.asc" });
  const response = await fetch(`${url}/rest/v1/cars?${params.toString()}`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } });
  if (!response.ok) throw new Error(`Could not load FleetDesk vehicles (${response.status})`);
  return response.json() as Promise<FleetCar[]>;
}

async function getCar(request: ApiRequest, carId: string): Promise<FleetCar> {
  const { token, url, anonKey } = getSupabaseConfig(request);
  const params = new URLSearchParams({ select: "id,plate,status,mulkiya_pdf_path", id: `eq.${carId}`, limit: "1" });
  const response = await fetch(`${url}/rest/v1/cars?${params.toString()}`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } });
  if (!response.ok) throw new Error(`Could not verify vehicle (${response.status})`);
  const car = ((await response.json()) as FleetCar[])[0];
  if (!car) throw new Error("Vehicle is not available to this FleetDesk account");
  if (car.status === "Sold") throw new Error("Sold vehicles cannot receive Mulkiya imports");
  return car;
}

function parseImageDataUrl(value: string) {
  const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value);
  if (!match) throw new Error("Invalid Mulkiya image data");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 100 || bytes.length > 8 * 1024 * 1024) throw new Error("Mulkiya image size is invalid");
  return { type: match[1].toLowerCase(), bytes };
}

async function imagesToPdf(imageDataUrls: string[]) {
  if (!imageDataUrls.length || imageDataUrls.length > 4) throw new Error("Mulkiya images were not found");
  const pdf = await PDFDocument.create();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 28;

  for (const dataUrl of imageDataUrls) {
    const { type, bytes } = parseImageDataUrl(dataUrl);
    const image = type === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
  }

  return Buffer.from(await pdf.save());
}

async function uploadMulkiya(request: ApiRequest, carId: string, pdfBase64?: string, imageDataUrls?: string[]) {
  let bytes: Buffer;
  if (imageDataUrls?.length) {
    bytes = await imagesToPdf(imageDataUrls);
  } else if (pdfBase64 && /^[A-Za-z0-9+/=\r\n]+$/.test(pdfBase64)) {
    bytes = Buffer.from(pdfBase64, "base64");
  } else {
    throw new Error("Mulkiya document data is missing");
  }

  if (bytes.length < 100 || bytes.length > 10 * 1024 * 1024) throw new Error("PDF file size is invalid");
  if (bytes.subarray(0, 4).toString("ascii") !== "%PDF") throw new Error("Generated document is not a PDF");

  const car = await getCar(request, carId);
  if (car.mulkiya_pdf_path) return { status: "skipped", plate: car.plate, message: "Mulkiya already exists" };

  const userId = await getCurrentUserId(request);
  const { token, url, anonKey } = getSupabaseConfig(request);
  const safePlate = normalizePlate(car.plate) || car.id;
  const path = `${userId}/cars/${car.id}/mulkiya-${safePlate}.pdf`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");

  const uploadResponse = await fetch(`${url}/storage/v1/object/${VEHICLE_DOCUMENTS_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/pdf", "x-upsert": "false" },
    body: bytes,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(`Storage upload failed (${uploadResponse.status})${detail ? `: ${detail}` : ""}`);
  }

  const updateResponse = await fetch(`${url}/rest/v1/cars?id=eq.${encodeURIComponent(car.id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ mulkiya_pdf_path: path }),
  });
  if (!updateResponse.ok) throw new Error(`Could not link Mulkiya to vehicle (${updateResponse.status})`);
  return { status: "imported", plate: car.plate, path };
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return void response.status(405).json({ error: "Method not allowed" });
  if (!(await requireFleetDeskUser(request))) return void response.status(401).json({ error: "Unauthorized" });

  const payload = (request.body ?? {}) as TammPayload;
  try {
    if (payload.action === "targets") {
      const cars = await getActiveFleetCars(request);
      response.status(200).json({
        total: cars.length,
        targets: cars.filter((car) => !car.mulkiya_pdf_path).map(({ id, plate }) => ({ id, plate })),
        skipped: cars.filter((car) => Boolean(car.mulkiya_pdf_path)).map(({ id, plate }) => ({ id, plate })),
      });
      return;
    }
    if (payload.action === "upload") {
      if (!payload.carId || (!payload.pdfBase64 && !payload.imageDataUrls?.length)) {
        response.status(400).json({ error: "Vehicle and Mulkiya document are required" });
        return;
      }
      response.status(200).json(await uploadMulkiya(request, payload.carId, payload.pdfBase64, payload.imageDataUrls));
      return;
    }
    response.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("TAMM local helper API failed", error);
    response.status(500).json({ error: error instanceof Error ? error.message : "TAMM import failed" });
  }
}
