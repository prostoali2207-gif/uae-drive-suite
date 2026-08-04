const TAMM_URL = "https://www.tamm.abudhabi/wb/adp/services-dashboard/vehicles";

async function getConfig() {
  const stored = await chrome.storage.session.get(["fleetdeskToken", "fleetdeskApiBase"]);
  if (!stored.fleetdeskToken || !stored.fleetdeskApiBase) {
    throw new Error("Open FleetDesk and start the TAMM import first");
  }
  return { token: stored.fleetdeskToken, apiBase: stored.fleetdeskApiBase };
}

async function apiRequest(body) {
  const { token, apiBase } = await getConfig();
  const response = await fetch(`${apiBase}/api/tamm-mulkiya`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `FleetDesk request failed (${response.status})`);
  return result;
}

async function broadcast(message) {
  const tabs = await chrome.tabs.query({ url: ["https://*.vercel.app/*"] });
  await Promise.all(tabs.map((tab) => tab.id ? chrome.tabs.sendMessage(tab.id, message).catch(() => undefined) : undefined));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "FLEETDESK_PING") {
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return;
    }

    if (message?.type === "FLEETDESK_CONFIGURE") {
      await chrome.storage.session.set({
        fleetdeskToken: message.token,
        fleetdeskApiBase: message.apiBase,
      });
      await chrome.tabs.create({ url: TAMM_URL });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "FLEETDESK_API") {
      sendResponse({ ok: true, data: await apiRequest(message.body) });
      return;
    }

    if (message?.type === "FLEETDESK_PROGRESS") {
      await chrome.storage.session.set({ fleetdeskLastProgress: message.payload });
      await broadcast({ type: "FLEETDESK_PROGRESS", payload: message.payload });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "FLEETDESK_GET_PROGRESS") {
      const stored = await chrome.storage.session.get("fleetdeskLastProgress");
      sendResponse({ ok: true, payload: stored.fleetdeskLastProgress || null });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message" });
  })().catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
