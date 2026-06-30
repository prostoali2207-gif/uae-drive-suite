function hasOpenOverlay() {
  return Boolean(
    document.querySelector(
      [
        '[data-state="open"][role="dialog"]',
        '[data-state="open"][role="alertdialog"]',
        "[data-radix-popper-content-wrapper]",
        '[data-radix-select-content]',
        '[data-radix-popover-content]',
        '[data-radix-dropdown-menu-content]',
      ].join(","),
    ),
  );
}

function clearStaleBodyLocks() {
  if (hasOpenOverlay()) return;

  if (document.body.style.pointerEvents === "none") {
    document.body.style.pointerEvents = "";
    console.warn("[FleetDesk] Cleared stale body pointer lock");
  }

  if (document.body.style.overflow === "hidden") {
    document.body.style.overflow = "";
    console.warn("[FleetDesk] Cleared stale body scroll lock");
  }
}

export function installInteractionLockWatchdog() {
  if (typeof document === "undefined") return () => {};

  const onRecoverableEvent = () => window.setTimeout(clearStaleBodyLocks, 120);

  document.addEventListener("visibilitychange", onRecoverableEvent);
  window.addEventListener("focus", onRecoverableEvent);
  window.addEventListener("pageshow", onRecoverableEvent);
  const interval = window.setInterval(clearStaleBodyLocks, 5000);

  return () => {
    document.removeEventListener("visibilitychange", onRecoverableEvent);
    window.removeEventListener("focus", onRecoverableEvent);
    window.removeEventListener("pageshow", onRecoverableEvent);
    window.clearInterval(interval);
  };
}
