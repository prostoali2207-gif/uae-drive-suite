import { chromium, type Browser, type Page } from "playwright-core";

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type BrowserbaseSession = {
  id: string;
  connectUrl: string;
};

const readBearerToken = (request: ApiRequest) => {
  const raw = request.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
};

export async function requireFleetDeskUser(request: ApiRequest) {
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

export function ensureBrowserbaseConfigured() {
  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    throw new Error("Browserbase is not configured");
  }
}

const browserbaseHeaders = () => ({
  "Content-Type": "application/json",
  "x-bb-api-key": process.env.BROWSERBASE_API_KEY ?? "",
});

export async function createBrowserAgentSession(purpose: string) {
  ensureBrowserbaseConfigured();

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
      userMetadata: { purpose },
    }),
  });

  if (!response.ok) {
    throw new Error(`Browserbase session failed (${response.status})`);
  }

  return response.json() as Promise<BrowserbaseSession>;
}

export async function getBrowserAgentSession(sessionId: string) {
  ensureBrowserbaseConfigured();

  const response = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}`, {
    headers: browserbaseHeaders(),
  });

  if (!response.ok) throw new Error("Browser session is no longer available");
  return response.json() as Promise<BrowserbaseSession>;
}

export async function getBrowserAgentLiveUrl(sessionId: string) {
  ensureBrowserbaseConfigured();

  const response = await fetch(`https://api.browserbase.com/v1/sessions/${sessionId}/debug`, {
    headers: browserbaseHeaders(),
  });

  if (!response.ok) return null;
  const data = (await response.json()) as { debuggerFullscreenUrl?: string };
  return data.debuggerFullscreenUrl ?? null;
}

export async function connectBrowserAgent(sessionId: string): Promise<Browser> {
  const session = await getBrowserAgentSession(sessionId);
  return chromium.connectOverCDP(session.connectUrl);
}

export async function getAgentPage(browser: Browser): Promise<Page> {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  return context.pages()[0] ?? context.newPage();
}
