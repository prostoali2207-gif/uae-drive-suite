# UX benchmark: Smooth contract signature

Date: 2026-08-02
Status: accepted

## Manager job

When a rental contract is ready, the manager or customer needs to draw and confirm each required signature quickly on a phone, so that the saved contract contains a legible signature.

## FleetDesk constraints

- Rental-operations rules: signature capture must not change contract amounts, availability or status before the existing final save.
- Data source of truth: the existing signature PNG saved by the contract signing flow.
- Financial or availability risk: no new risk; activation remains the existing explicit action.
- Mobile / RTL constraints: full-screen 390px drawing, large controls, no page gestures while drawing; names may be RTL while controls remain understandable.

## References reviewed

### Reference 1 — Signature Pad / Square smoothing model

- Comparable job: capture a natural handwritten signature in a browser.
- Observed interaction: variable-width Bézier curves filtered by drawing velocity.
- Why it works: removes angular line segments while keeping fast and slow strokes visually natural.
- What FleetDesk can reuse: velocity filtering, variable width, high-DPI canvas and transparent PNG output.
- What FleetDesk must reject: default tuning without checking mobile responsiveness.
- Evidence: documented guidance.

### Reference 2 — W3C Pointer Events canvas guidance

- Comparable job: low-latency finger or pen drawing on a canvas.
- Observed interaction: pointer input with browser gestures disabled on the drawing surface.
- Why it works: avoids scrolling or zooming stealing the signature stroke.
- What FleetDesk can reuse: `touch-action: none`, device-independent pointer input and high-frequency points.
- What FleetDesk must reject: a technical drawing UI with developer controls.
- Evidence: documented guidance.

### Reference 3 — Established e-signature undo pattern

- Comparable job: correct a mistaken signature without restarting the signing flow.
- Observed interaction: confirm is the primary action; undo-last-stroke and clear are secondary actions beside the canvas.
- Why it works: a small mistake can be recovered without redrawing everything.
- What FleetDesk can reuse: visible Undo and Clear buttons with large touch targets.
- What FleetDesk must reject: typed-signature styles because FleetDesk requires actual drawing.
- Evidence: observed common interaction pattern and inference.

## Comparison

- Fastest normal path: draw once and tap Done.
- Safest consequential path: Done only enables after ink exists; contract activation remains separate.
- Best bulk / repeated-work pattern: keep the signer sequence and reuse the same full-screen pad.
- Best exception-handling pattern: undo the last stroke or clear the pad.
- Best mobile behavior: full-screen canvas, no touch scrolling, 48px secondary controls.

## Recommendation

Recommended interaction model: keep the existing full-screen signing step, improve the curve engine tuning, and add Undo stroke beside Clear.

Why it fits FleetDesk: it improves the one weak part—the handwriting feel—without changing contract workflow, storage or activation logic.

Patterns explicitly rejected: typed signature fonts, decorative pen selectors, multiple signature modes and a multi-step signature wizard.

## Scenarios to test

1. Draw slowly and quickly with a finger at 390px; the line stays continuous and smooth.
2. Undo one of several strokes, then undo the final stroke; Done disables when empty.
3. Clear, redraw and save; the resulting PNG remains cropped and legible in the contract.
