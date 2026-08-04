window.addEventListener("message", async (event) => {
  if (event.source !== window || !event.data) return;

  if (event.data.type === "FLEETDESK_TAMM_PING") {
    const response = await chrome.runtime.sendMessage({ type: "FLEETDESK_PING" }).catch(() => null);
    window.postMessage({ type: "FLEETDESK_TAMM_PONG", response }, "*");
    return;
  }

  if (event.data.type === "FLEETDESK_TAMM_CONFIGURE") {
    const response = await chrome.runtime.sendMessage({
      type: "FLEETDESK_CONFIGURE",
      token: event.data.token,
      apiBase: event.data.apiBase,
    }).catch((error) => ({ ok: false, error: String(error) }));
    window.postMessage({ type: "FLEETDESK_TAMM_CONFIGURED", response }, "*");
    return;
  }

  if (event.data.type === "FLEETDESK_TAMM_GET_PROGRESS") {
    const response = await chrome.runtime.sendMessage({ type: "FLEETDESK_GET_PROGRESS" }).catch(() => null);
    window.postMessage({ type: "FLEETDESK_TAMM_PROGRESS", payload: response?.payload || null }, "*");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "FLEETDESK_PROGRESS") {
    window.postMessage({ type: "FLEETDESK_TAMM_PROGRESS", payload: message.payload }, "*");
  }
});
