import {
  type ApiRequest,
  type ApiResponse,
  connectBrowserAgent,
  createBrowserAgentSession,
  getAgentPage,
  getBrowserAgentLiveUrl,
  requireFleetDeskUser,
} from "./_browser-agent.js";

export const config = { maxDuration: 120 };

const TAMM_VEHICLES_URL = "https://www.tamm.abudhabi/wb/adp/services-dashboard/vehicles";

type TammPayload = {
  action?: "start" | "scan";
  sessionId?: string;
};

type FleetCar = {
  id: string;
  plate: string;
  status: string;
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

async function getActiveFleetCars(request: ApiRequest): Promise<FleetCar[]> {
  const token = readBearerToken(request);
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!token || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("FleetDesk authentication is unavailable");
  }

  const params = new URLSearchParams({
    select: "id,plate,status",
    status: "neq.Sold",
    order: "plate.asc",
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/cars?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Could not load FleetDesk vehicles (${response.status})`);
  }

  return response.json() as Promise<FleetCar[]>;
}

async function startTammSession() {
  const session = await createBrowserAgentSession("fleetdesk-tamm-mulkiya");
  const browser = await connectBrowserAgent(session.id);

  try {
    const page = await getAgentPage(browser);
    await page.goto(TAMM_VEHICLES_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }

  const liveUrl = await getBrowserAgentLiveUrl(session.id);
  return { sessionId: session.id, liveUrl };
}

async function scanTammVehicles(request: ApiRequest, sessionId: string) {
  const fleetCars = await getActiveFleetCars(request);
  const browser = await connectBrowserAgent(sessionId);

  try {
    const page = await getAgentPage(browser);
    if (!page.url().includes("tamm.abudhabi")) {
      await page.goto(TAMM_VEHICLES_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
    }

    await page.waitForTimeout(3_000);
    const currentUrl = page.url();
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const normalizedBody = normalizePlate(bodyText);

    const found = fleetCars.filter((car) => normalizedBody.includes(normalizePlate(car.plate)));
    const missing = fleetCars.filter((car) => !normalizedBody.includes(normalizePlate(car.plate)));

    const looksLoggedOut =
      /uae\s*pass|sign\s*in|login|log\s*in/i.test(bodyText) && found.length === 0;

    return {
      currentUrl,
      loggedIn: !looksLoggedOut,
      totalFleetVehicles: fleetCars.length,
      found: found.map(({ id, plate, status }) => ({ id, plate, status })),
      missing: missing.map(({ id, plate, status }) => ({ id, plate, status })),
      pagePreview: bodyText.replace(/\s+/g, " ").slice(0, 300),
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

    if (payload.action === "scan") {
      if (!payload.sessionId) {
        response.status(400).json({ error: "Browser session is required" });
        return;
      }

      response.status(200).json(await scanTammVehicles(request, payload.sessionId));
      return;
    }

    response.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("TAMM Mulkiya agent failed", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "TAMM Mulkiya agent failed",
    });
  }
}
