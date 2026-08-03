import { chromium, type Page } from "playwright-core";

export const config = { maxDuration: 120 };

const GDRFA_UID_URL = "https://www.gdrfad.gov.ae/en/unified-number-inquiry-service";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type LookupPayload = {
  action?: "start" | "run";
  sessionId?: string;
  passportNumber?: string;
  nationality?: string;
  dateOfBirth?: string;
  gender?: "male" | "female";
};

const readBearerToken = (request: ApiRequest) => {
  const raw = request.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
};

async function requireFleetDeskUser(request: ApiRequest) {
  const token = readBearerToken(request);
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!token || !supabaseUrl || !supabaseAnonKey) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  });

  return response.ok;
}

const browserbaseHeaders = () => ({
  "Content-Type": "application/json",
  "x-bb-api-key": process.env.BROWSERBASE_API_KEY ?? "",
});

async function createSession() {
  const response = await fetch("https://api.browserbase.com/v1/sessions", {
    method: "POST",
    headers: browserbaseHeaders(),
    body: JSON.stringify({
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      region: "eu-central-1",
      browserSettings: {
        solveCaptchas: true,
        viewport: { width: 1280, height: 900 },
      },
      userMetadata: { purpose: "fleetdesk-gdrfa-uid" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Browserbase session failed (${response.status})`);
  }

  return response.json() as Promise<{ id: string; connectUrl: string }>;
}

async function getSession(sessionId: string) {
  const response = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
    headers: browserbaseHeaders(),
  });
  if (!response.ok) throw new Error("Browser session is no longer available");
  return response.json() as Promise<{ connectUrl: string }>;
}

async function getLiveUrl(sessionId: string) {
  const response = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}/debug`, {
    headers: browserbaseHeaders(),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { debuggerFullscreenUrl?: string };
  return data.debuggerFullscreenUrl ?? null;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

async function selectNationality(page: Page, nationality: string) {
  const select = page.locator("select").first();
  const options = await select.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      label: (node.textContent ?? "").trim(),
    })),
  );

  const wanted = normalize(nationality);
  const match = options.find((option) => {
    const label = normalize(option.label);
    return label === wanted || label.includes(wanted) || wanted.includes(label);
  });

  if (!match?.value) throw new Error(`Nationality “${nationality}” was not found on GDRFA`);
  await select.selectOption(match.value);
}

async function fillDateOfBirth(page: Page, dateOfBirth: string) {
  const [year, month, day] = dateOfBirth.split("-");
  if (!year || !month || !day) throw new Error("Invalid date of birth");

  const selects = page.locator("select");
  if ((await selects.count()) < 4) throw new Error("GDRFA date fields were not found");

  await selects.nth(1).selectOption(String(Number(day)));
  await selects.nth(2).selectOption(String(Number(month)));
  await selects.nth(3).selectOption(year);
}

async function fillLookupForm(page: Page, payload: Required<Pick<LookupPayload, "passportNumber" | "nationality" | "dateOfBirth" | "gender">>) {
  await page.goto(GDRFA_UID_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });

  const passport = page.getByLabel(/Passport Number/i).first();
  await passport.waitFor({ state: "visible", timeout: 30_000 });
  await passport.fill(payload.passportNumber);
  await selectNationality(page, payload.nationality);
  await fillDateOfBirth(page, payload.dateOfBirth);

  const selector = payload.gender === "male" ? "#edit-gender-1" : "#edit-gender-2";
  await page.locator(selector).evaluate((element) => {
    const input = element as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function waitForCaptcha(page: Page) {
  const responseField = page.locator('textarea[name="g-recaptcha-response"]');
  try {
    await page.waitForFunction(
      () => {
        const field = document.querySelector('textarea[name="g-recaptcha-response"]') as HTMLTextAreaElement | null;
        return Boolean(field?.value);
      },
      undefined,
      { timeout: 55_000 },
    );
  } catch {
    if ((await responseField.count()) === 0) return;
    throw new Error("CAPTCHA was not completed. Use the opened live browser and try again.");
  }
}

function extractUid(text: string) {
  const patterns = [
    /(?:Unified\s*(?:Number|No\.?|ID)|UID)\s*[:\-]?\s*(\d{6,15})/i,
    /\b(\d{9})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function runLookup(sessionId: string, payload: Required<Pick<LookupPayload, "passportNumber" | "nationality" | "dateOfBirth" | "gender">>) {
  const session = await getSession(sessionId);
  const browser = await chromium.connectOverCDP(session.connectUrl);

  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? (await context.newPage());
    await fillLookupForm(page, payload);
    await waitForCaptcha(page);

    const submitButton = page.getByRole("button", { name: /Submit/i }).first();
    await submitButton.click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(2_000);

    const pageText = await page.locator("body").innerText();
    const uid = extractUid(pageText);

    if (!uid) {
      const compact = pageText.replace(/\s+/g, " ").slice(0, 500);
      throw new Error(compact.includes("not found") ? "GDRFA did not find a UID for these details" : "UID was not found in the GDRFA response");
    }

    return uid;
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

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    response.status(503).json({ error: "Browserbase is not configured" });
    return;
  }

  const payload = (request.body ?? {}) as LookupPayload;

  try {
    if (payload.action === "start") {
      const session = await createSession();
      const liveUrl = await getLiveUrl(session.id);
      response.status(200).json({ sessionId: session.id, liveUrl });
      return;
    }

    if (payload.action === "run") {
      if (!payload.sessionId || !payload.passportNumber || !payload.nationality || !payload.dateOfBirth || !payload.gender) {
        response.status(400).json({ error: "Passport, nationality, date of birth and gender are required" });
        return;
      }

      const uid = await runLookup(payload.sessionId, {
        passportNumber: payload.passportNumber.trim(),
        nationality: payload.nationality.trim(),
        dateOfBirth: payload.dateOfBirth,
        gender: payload.gender,
      });
      response.status(200).json({ uid });
      return;
    }

    response.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("GDRFA UID lookup failed", error);
    response.status(500).json({ error: error instanceof Error ? error.message : "UID lookup failed" });
  }
}
