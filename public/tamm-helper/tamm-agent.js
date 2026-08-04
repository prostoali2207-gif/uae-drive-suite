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
  panel.innerHTML = `<div style="font-weight:700;font-size:15px;margin-bottom:6px">FleetDesk Mulkiya Import</div><div id="fleetdesk-helper-status" style="font-size:12px;line-height:1.45;color:#cbd5e1;margin-bottom:10px">Log in to TAMM, select Al Musafir Car Rental, then start.</div><button id="fleetdesk-helper-start" style="width:100%;border:0;border-radius:8px;padding:10px;background:#14b8a6;color:#06201d;font-weight:700;cursor:pointer">Start import</button>`;
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

async function findSearchInput() {
  for (let i = 0; i < 20; i += 1) {
    const inputs = [...document.querySelectorAll('input[placeholder*="Search" i], input[type="search"]')].filter((input) => input.offsetParent !== null && !input.disabled);
    if (inputs.length) return inputs[inputs.length - 1];
    await sleep(500);
  }
  throw new Error("TAMM vehicle search was not found");
}

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value); else input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForVehicleRow(plate, timeout = 5000) {
  const wanted = normalizePlate(plate);
  const digits = String(plate || "").replace(/\D/g, "");
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const rows = [...document.querySelectorAll("tr")].filter((row) => row.offsetParent !== null);
    const match = rows.find((row) => {
      const normalized = normalizePlate(row.innerText);
      return normalized.includes(wanted) || (digits.length >= 4 && normalized.includes(digits));
    });
    if (match) return match;
    await sleep(250);
  }
  return null;
}

async function searchPlate(plate) {
  const input = await findSearchInput();
  input.focus();
  setNativeInputValue(input, "");
  await sleep(350);
  const digits = String(plate || "").replace(/\D/g, "");
  setNativeInputValue(input, digits || plate);
  await sleep(900);
  let row = await waitForVehicleRow(plate, 4500);
  if (!row && digits && digits !== plate) {
    setNativeInputValue(input, plate);
    await sleep(900);
    row = await waitForVehicleRow(plate, 3500);
  }
  return row;
}

async function openRegistration(row) {
  const buttons = [...row.querySelectorAll("button")];
  const menu = buttons[buttons.length - 1] || row.querySelector('[role="button"]');
  if (!menu) throw new Error("Vehicle action menu was not found");
  menu.click();
  await sleep(500);
  const registration = [...document.querySelectorAll("button, [role='menuitem'], li, div")].find((node) => node.textContent?.trim().toLowerCase() === "vehicle registration");
  if (!registration) throw new Error("Vehicle Registration action was not found");
  registration.click();
  for (let i = 0; i < 30; i += 1) {
    const dialog = [...document.querySelectorAll('[role="dialog"], .modal, [class*="modal" i]')].find((node) => node.offsetParent !== null && /digital document|vehicle license|download/i.test(node.innerText || ""));
    if (dialog) return dialog;
    await sleep(500);
  }
  throw new Error("Mulkiya document window was not found");
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read Mulkiya image"));
    reader.readAsDataURL(blob);
  });
}

async function imageToDataUrl(img) {
  const src = img.currentSrc || img.src;
  if (src?.startsWith("data:image/")) return src;
  if (src) {
    try {
      const response = await fetch(src, { credentials: "include" });
      if (response.ok) return await blobToDataUrl(await response.blob());
    } catch {
      // Fall back to canvas below.
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const context = canvas.getContext("2d");
  if (!context || !canvas.width || !canvas.height) throw new Error("Mulkiya image is empty");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

async function collectMulkiyaImages(dialog) {
  await sleep(800);
  const images = [...dialog.querySelectorAll("img")].filter((img) => {
    const width = img.naturalWidth || img.width || img.getBoundingClientRect().width;
    const height = img.naturalHeight || img.height || img.getBoundingClientRect().height;
    return img.offsetParent !== null && width >= 250 && height >= 120;
  });
  const canvases = [...dialog.querySelectorAll("canvas")].filter((canvas) => canvas.offsetParent !== null && canvas.width >= 250 && canvas.height >= 120);
  const data = [];
  for (const img of images) {
    const value = await imageToDataUrl(img);
    if (value.startsWith("data:image/")) data.push(value);
  }
  for (const canvas of canvases) {
    try {
      data.push(canvas.toDataURL("image/png"));
    } catch {
      // Ignore inaccessible decorative canvases.
    }
  }
  const unique = [...new Set(data)];
  if (!unique.length) throw new Error("Mulkiya card images were not found");
  return unique.slice(0, 4);
}

async function closeDocument() {
  const dialogs = [...document.querySelectorAll('[role="dialog"], .modal, [class*="modal" i]')].filter((node) => node.offsetParent !== null);
  const scope = dialogs[dialogs.length - 1] || document;
  const buttons = [...scope.querySelectorAll("button")];
  const close = buttons.find((button) => /close/i.test(button.getAttribute("aria-label") || "")) || buttons.find((button) => button.textContent?.trim() === "×");
  if (close) close.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(500);
}

async function runImport() {
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
          const dialog = await openRegistration(row);
          const imageDataUrls = await collectMulkiyaImages(dialog);
          const upload = await api({ action: "upload", carId: car.id, imageDataUrls });
          if (upload.status === "skipped") summary.skipped += 1; else summary.imported += 1;
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

createPanel();
