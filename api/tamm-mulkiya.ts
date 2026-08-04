import {
  type ApiRequest,
  type ApiResponse,
  connectBrowserAgent,
  createBrowserAgentSession,
  getAgentPage,
  getBrowserAgentLiveUrl,
  requireFleetDeskUser,
} from "./_browser-agent.js";

export const config = { maxDuration: 300 };

const TAMM_VEHICLES_URL = "https://www.tamm.abudhabi/wb/adp/services-dashboard/vehicles";
const VEHICLE_DOCUMENTS_BUCKET = "vehicle-documents";

type TammPayload = {
  action?: "start" | "import";
  sessionId?: string;
};

type FleetCar = {
  id: string;
  plate: string;
  status: string;
  mulkiya_pdf_path: string | null;
};

type ImportItem = {
  id: string;
  plate: string;
  status: "imported" | "skipped" | "not_found" | "failed";
  message?: string;
};

const readBearerToken = (request: ApiRequest) => {
  const raw = request.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
};

const normalizePlate = (value: string) =>
  value
    .toUpperCase()
    .replace(/AJMAN|AJM/g, "")
    .replace(/[^A-Z0-9]/g, "");

const getSupabaseConfig = (request: ApiRequest) => {
  const token = readBearerToken(request);
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) throw new Error("FleetDesk authentication is unavailable");
  return { token, url, anonKey };
};

async function getCurrentUserId(request: ApiRequest) {
  const { token, url, anonKey } = getSupabaseConfig(request);
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!response.ok) throw new Error("Could not identify the FleetDesk user");
  const user = (await response.json()) as { id?: string };
  if (!user.id) throw new Error("FleetDesk user ID is missing");
  return user.id;
}

async function getActiveFleetCars(request: ApiRequest): Promise<FleetCar[]> {
  const { token, url, anonKey } = getSupabaseConfig(request);
  const params = new URLSearchParams({
    select: "id,plate,status,mulkiya_pdf_path",
    status: "neq.Sold",
    order: "plate.asc",
  });
  const response = await fetch(`${url}/rest/v1/cars?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!response.ok) throw new Error(`Could not load FleetDesk vehicles (${response.status})`);
  return response.json() as Promise<FleetCar[]>;
}

async function uploadMulkiya(request: ApiRequest, userId: string, car: FleetCar, bytes: Buffer) {
  const { token, url, anonKey } = getSupabaseConfig(request);
  const safePlate = normalizePlate(car.plate) || car.id;
  const path = `${userId}/cars/${car.id}/mulkiya-${safePlate}.pdf`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");

  const uploadResponse = await fetch(`${url}/storage/v1/object/${VEHICLE_DOCUMENTS_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/pdf",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(`Storage upload failed (${uploadResponse.status})${detail ? `: ${detail}` : ""}`);
  }

  const updateResponse = await fetch(`${url}/rest/v1/cars?id=eq.${encodeURIComponent(car.id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ mulkiya_pdf_path: path }),
  });
  if (!updateResponse.ok) throw new Error(`Could not link Mulkiya to vehicle (${updateResponse.status})`);
  return path;
}

async function startTammSession() {
  const session = await createBrowserAgentSession("fleetdesk-tamm-mulkiya");
  const browser = await connectBrowserAgent(session.id);
  try {
    const page = await getAgentPage(browser);
    await page.goto(TAMM_VEHICLES_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } finally {
    await browser.close().catch(() => undefined);
  }
  return { sessionId: session.id, liveUrl: await getBrowserAgentLiveUrl(session.id) };
}

async function ensureCompanyVehiclesPage(page: Awaited<ReturnType<typeof getAgentPage>>) {
  if (!page.url().includes("/services-dashboard/vehicles")) {
    await page.goto(TAMM_VEHICLES_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }
  await page.waitForTimeout(2_500);
  const text = await page.locator("body").innerText().catch(() => "");
  if (/uae\s*pass|sign\s*in|log\s*in/i.test(text) && !/vehicles\s*&\s*plates|vehicle services/i.test(text)) {
    throw new Error("UAE Pass login is not complete yet");
  }
  if (/change traffic profile/i.test(text) && !/al musafir car rental/i.test(text)) {
    throw new Error("Select the Al Musafir Car Rental traffic profile in the TAMM window, then retry");
  }
}

async function clearAndSearchPlate(page: Awaited<ReturnType<typeof getAgentPage>>, plate: string) {
  const search = page.getByPlaceholder(/search/i).last();
  if (!(await search.count())) return false;
  await search.fill(plate);
  await page.waitForTimeout(1_200);
  const body = normalizePlate(await page.locator("body").innerText().catch(() => ""));
  return body.includes(normalizePlate(plate));
}

async function downloadVehicleRegistration(page: Awaited<ReturnType<typeof getAgentPage>>, plate: string) {
  const normalized = normalizePlate(plate);
  const row = page.locator("tr").filter({ hasText: plate }).first();
  const rowExists = await row.count();

  if (rowExists) {
    const menuButton = row.locator("button").last();
    await menuButton.click();
  } else {
    const bodyText = normalizePlate(await page.locator("body").innerText().catch(() => ""));
    if (!bodyText.includes(normalized)) return null;
    const buttons = page.locator("button");
    const count = await buttons.count();
    if (!count) return null;
    await buttons.nth(count - 1).click();
  }

  const registration = page.getByText(/vehicle registration/i, { exact: true }).last();
  await registration.waitFor({ state: "visible", timeout: 10_000 });
  await registration.click();

  const downloadButton = page.getByRole("button", { name: /^download$/i }).last();
  await downloadButton.waitFor({ state: "visible", timeout: 15_000 });
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await downloadButton.click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("TAMM did not return a downloadable file");

  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  await page.keyboard.press("Escape").catch(() => undefined);
  return Buffer.concat(chunks);
}

async function importMulkiya(request: ApiRequest, sessionId: string) {
  const fleetCars = await getActiveFleetCars(request);
  const userId = await getCurrentUserId(request);
  const results: ImportItem[] = [];
  const browser = await connectBrowserAgent(sessionId);

  try {
    const page = await getAgentPage(browser);
    await ensureCompanyVehiclesPage(page);

    for (const car of fleetCars) {
      if (car.mulkiya_pdf_path) {
        results.push({ id: car.id, plate: car.plate, status: "skipped", message: "Mulkiya already exists" });
        continue;
      }

      try {
        const found = await clearAndSearchPlate(page, car.plate);
        if (!found) {
          results.push({ id: car.id, plate: car.plate, status: "not_found" });
          continue;
        }

        const bytes = await downloadVehicleRegistration(page, car.plate);
        if (!bytes?.length) {
          results.push({ id: car.id, plate: car.plate, status: "not_found" });
          continue;
        }

        await uploadMulkiya(request, userId, car, bytes);
        results.push({ id: car.id, plate: car.plate, status: "imported" });
      } catch (error) {
        results.push({
          id: car.id,
          plate: car.plate,
          status: "failed",
          message: error instanceof Error ? error.message : "Import failed",
        });
      }
    }

    return {
      totalFleetVehicles: fleetCars.length,
      imported: results.filter((item) => item.status === "imported").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      notFound: results.filter((item) => item.status === "not_found").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await requireFleetDeskUser(request))) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = (request.body ?? {}) as TammPayload;
  try {
    if (payload.action === "start") {
      response.status(200).json(await startTammSession());
      return;
    }
    if (payload.action === "import") {
      if (!payload.sessionId) {
        response.status(400).json({ error: "Browser session is required" });
        return;
      }
      response.status(200).json(await importMulkiya(request, payload.sessionId));
      return;
    }
    response.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("TAMM Mulkiya agent failed", error);
    response.status(500).json({ error: error instanceof Error ? error.message : "TAMM Mulkiya agent failed" });
  }
}
