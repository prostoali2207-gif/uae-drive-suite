(() => {
  if (window.__fleetdeskPdfHookInstalled) return;
  window.__fleetdeskPdfHookInstalled = true;

  const emitBlob = async (blob) => {
    try {
      if (!(blob instanceof Blob) || !/pdf/i.test(blob.type || "application/pdf")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        const base64 = value.includes(",") ? value.split(",")[1] : value;
        window.postMessage({ type: "FLEETDESK_PDF_CAPTURED", base64 }, "*");
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      window.postMessage({ type: "FLEETDESK_PDF_CAPTURE_ERROR", error: String(error) }, "*");
    }
  };

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    if (object instanceof Blob) void emitBlob(object);
    return originalCreateObjectURL(object);
  };

  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[download], a[href]") : null;
    if (!anchor) return;
    const href = anchor.href;
    if (!href || (!anchor.hasAttribute("download") && !/pdf/i.test(href))) return;
    setTimeout(async () => {
      try {
        const response = await fetch(href, { credentials: "include" });
        if (response.ok) await emitBlob(await response.blob());
      } catch {
        // Blob URL interception above remains the primary path.
      }
    }, 0);
  }, true);
})();
