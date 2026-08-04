const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizePlate = (value) => String(value || "").toUpperCase().replace(/AJMAN|AJM/g, "").replace(/[^A-Z0-9]/g, "");

function api(body) {
  return chrome.runtime.sendMessage({ type: "FLEETDESK_API", body }).then((response) => {
    if (!response?.ok) throw new Error(response?.error || "FleetDesk helper request failed");
    return response.data;
  });
}

function report(payload) {
  return chrome.runtime.sendMessage({ type: "FLEETDESK_PROGRESS", payload }).catch(() => undefined);
}

function createPanel() {
  if (document.getElementById("fleetdesk-tamm-helper")) return;
  const panel = document.createElement("div");
  panel.id = "fleetdesk-tamm-helper";
  panel.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;width:310px;background:#111827;color:#fff;border-radius:12px;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:14px Arial,sans-serif";
  panel.innerHTML = `
    <div style="font-weight:700;font-size:15px;margin-bottom:6px">FleetDesk Mulkiya Import</div>
    <div id="fleetdesk-helper-status" style="font-size:12px;line-height:1.45;color:#cbd5e1;margin-bottom:10px">Log in to TAMM, select Al Musafir Car Rental, then start.</div>
    <button id="fleetdesk-helper-start" style="width:100%;border:0;border-radius:8px;padding:10px;background:#14b8a6;color:#06201d;font-weight:700;cursor:pointer">Start import</button>
  `;
  document.documentElement.appendChild(panel);
  panel.querySelector("#fleetdesk-helper-start").addEventListener("click", runImport);
}

function setStatus(text, busy = false) {
  const status = document.getElementById("fleetdesk-helper-status");
  const button = document.getElementById("fleetdesk-helper-start");
  if (status) status.textContent = text;
  if (button) {
    button.disabled = busy;
    button.style.opacity = busy ? ".65" : "1";
    button.textContent = busy ? "Working…" : "Start import";
  }
}

function injectHook() {
  if (document.getElementById("fleetdesk-page-hook")) return;
  const script = document.createElement("script");
  script.id = "fleetdesk-page-hook";
  script.src = chrome.runtime.getURL("page-hook.js");
  (document.head || document.documentElement).appendChild(script);
}

function waitForCapturedPdf(timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("TAMM download was not captured"));
    }, timeout);
    const handler = (event) => {
      if (event.source !== window || !event.data) return;
      if (event.data.type === "FLEETDESK_PDF_CAPTURED" && event.data.base64) {
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        resolve(event.data.base64);
      }
      if (event.data.type === "FLEETDESK_PDF_CAPTURE_ERROR") {
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        reject(new Error(event.data.error || "Could not capture PDF"));
      }
    };
    window.addEventListener("message", handler);
  });
}

async function findSearchInput() {
  for (let i = 0; i < 20; i += 1) {
    const inputs = [...document.querySelectorAll('input[placeholder*="Search" i], input[type="search"]')];
    if (inputs.length) return inputs[inputs.length - 1];
    await sleep(500);
  }
  throw new Error("TAMM vehicle search was not found");
}

async function searchPlate(plate) {
  const input = await findSearchInput();
  input.focus();
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(200);
  input.value = plate;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1400);

  const wanted = normalizePlate(plate);
  return [...document.querySelectorAll("tr")].find((row) => normalizePlate(row.innerText).includes(wanted)) || null;
}

async function openRegistration(row) {
  const buttons = [...row.querySelectorAll("button")];
  const menu = buttons[buttons.length - 1] || row.querySelector('[role="button"]');
  if (!menu) throw new Error("Vehicle action menu was not found");
  menu.click();
  await sleep(500);

  const registration = [...document.querySelectorAll("button, [role='menuitem'], li, div")]
    .find((node) => node.textContent?.trim().toLowerCase() === "vehicle registration");
  if (!registration) throw new Error("Vehicle Registration action was not found");
  registration.click();

  for (let i = 0; i < 30; i += 1) {
    const download = [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim().toLowerCase() === "download");
    if (download) return download;
    await sleep(500);
  }
  throw new Error("Mulkiya Download button was not found");
}

async function closeDocument() {
  const candidates = [...document.querySelectorAll("button")];
  const close = candidates.find((button) => /close/i.test(button.getAttribute("aria-label") || "")) || candidates.find((button) => button.textContent?.trim() === "×");
  if (close) close.click();
  else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(400);
}

async function runImport() {
  injectHook();
  setStatus("Checking FleetDesk vehicles…", true);

  const summary = { imported: 0, skipped: 0, notFound: 0, failed: 0, items: [] };
  try {
    const text = document.body.innerText;
    if (/sign in with uae pass|login to uae pass/i.test(text)) throw new Error("Complete UAE PASS login first");
    if (!/al musafir car rental/i.test(text)) throw new Error("Select the Al Musafir Car Rental traffic profile first");

    const targetsResult = await api({ action: "targets" });
    summary.skipped = targetsResult.skipped?.length || 0;
    const targets = targetsResult.targets || [];

    await report({ state: "running", total: targetsResult.total, current: 0, summary });
    if (!targets.length) {
      setStatus("All active FleetDesk vehicles already have Mulkiya.");
      await report({ state: "done", total: targetsResult.total, current: 0, summary });
      return;
    }

    for (let index = 0; index < targets.length; index += 1) {
      const car = targets[index];
      setStatus(`Processing ${car.plate} (${index + 1}/${targets.length})…`, true);
      try {
        const row = await searchPlate(car.plate);
        if (!row) {
          summary.notFound += 1;
          summary.items.push({ plate: car.plate, status: "not_found" });
        } else {
          const downloadButton = await openRegistration(row);
          const pdfPromise = waitForCapturedPdf();
          downloadButton.click();
          const pdfBase64 = await pdfPromise;
          const upload = await api({ action: "upload", carId: car.id, pdfBase64 });
          if (upload.status === "skipped") summary.skipped += 1;
          else summary.imported += 1;
          summary.items.push({ plate: car.plate, status: upload.status });
          await closeDocument();
        }
      } catch (error) {
        summary.failed += 1;
        summary.items.push({ plate: car.plate, status: "failed", message: error instanceof Error ? error.message : String(error) });
        await closeDocument().catch(() => undefined);
      }
      await report({ state: "running", total: targetsResult.total, current: index + 1, summary });
    }

    setStatus(`Done. Imported ${summary.imported}, skipped ${summary.skipped}, not found ${summary.notFound}, failed ${summary.failed}.`);
    await report({ state: "done", total: targetsResult.total, current: targets.length, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
    await report({ state: "error", message, summary });
  } finally {
    const button = document.getElementById("fleetdesk-helper-start");
    if (button) {
      button.disabled = false;
      button.style.opacity = "1";
      button.textContent = "Start import";
    }
  }
}

injectHook();
createPanel();
