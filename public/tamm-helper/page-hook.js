(() => {
  if (window.__fleetdeskPdfHookInstalled) return;
  window.__fleetdeskPdfHookInstalled = true;

  const looksLikePdf = (bytes) => {
    if (!bytes || bytes.byteLength < 5) return false;
    const head = new Uint8Array(bytes.slice(0, 5));
    return String.fromCharCode(...head) === "%PDF-";
  };

  const emitBlob = async (blob) => {
    try {
      if (!(blob instanceof Blob)) return;
      const bytes = await blob.arrayBuffer();
      if (!/pdf/i.test(blob.type || "") && !looksLikePdf(bytes)) return;
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        const base64 = value.includes(",") ? value.split(",")[1] : value;
        window.postMessage({ type: "FLEETDESK_PDF_CAPTURED", base64 }, "*");
      };
      reader.readAsDataURL(new Blob([bytes], { type: "application/pdf" }));
    } catch (error) {
      window.postMessage({ type: "FLEETDESK_PDF_CAPTURE_ERROR", error: String(error) }, "*");
    }
  };

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    if (object instanceof Blob) void emitBlob(object);
    return originalCreateObjectURL(object);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const clone = response.clone();
      const contentType = clone.headers.get("content-type") || "";
      const disposition = clone.headers.get("content-disposition") || "";
      const url = clone.url || String(args[0] || "");
      if (/pdf|octet-stream/i.test(contentType) || /attachment|pdf/i.test(disposition) || /document|download|certificate|registration/i.test(url)) {
        void clone.blob().then(emitBlob).catch(() => undefined);
      }
    } catch {
      // Keep TAMM's original request untouched.
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__fleetdeskUrl = String(url || "");
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener("load", () => {
      try {
        const contentType = this.getResponseHeader("content-type") || "";
        const disposition = this.getResponseHeader("content-disposition") || "";
        const url = this.responseURL || this.__fleetdeskUrl || "";
        if (!/pdf|octet-stream/i.test(contentType) && !/attachment|pdf/i.test(disposition) && !/document|download|certificate|registration/i.test(url)) return;

        if (this.response instanceof Blob) {
          void emitBlob(this.response);
        } else if (this.response instanceof ArrayBuffer) {
          void emitBlob(new Blob([this.response], { type: contentType || "application/pdf" }));
        } else if (typeof this.response === "string" && this.response.startsWith("data:application/pdf;base64,")) {
          window.postMessage({ type: "FLEETDESK_PDF_CAPTURED", base64: this.response.split(",")[1] }, "*");
        }
      } catch {
        // Ignore non-download XHR responses.
      }
    });
    return originalSend.apply(this, args);
  };

  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[download], a[href]") : null;
    if (!anchor) return;
    const href = anchor.href;
    if (!href || (!anchor.hasAttribute("download") && !/pdf|download|document/i.test(href))) return;
    setTimeout(async () => {
      try {
        const response = await originalFetch(href, { credentials: "include" });
        if (response.ok) await emitBlob(await response.blob());
      } catch {
        // Fetch/XHR/blob interception above remains the primary path.
      }
    }, 0);
  }, true);
})();
