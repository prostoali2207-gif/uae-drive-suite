import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import SignaturePad from "signature_pad";
import { cn } from "@/lib/utils";

export interface SmoothSignatureCanvasRef {
  isEmpty: () => boolean;
  getDataUrl: () => string;
  clear: () => void;
  undo: () => void;
}

function croppedDataUrl(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      if (pixels.data[index + 3] > 0) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) return "";
  const padding = Math.round(Math.max(canvas.width, canvas.height) * 0.02);
  const sx = Math.max(0, left - padding), sy = Math.max(0, top - padding);
  const width = Math.min(canvas.width - sx, right - left + padding * 2 + 1);
  const height = Math.min(canvas.height - sy, bottom - top + padding * 2 + 1);
  const output = document.createElement("canvas");
  output.width = width; output.height = height;
  const outputContext = output.getContext("2d");
  if (!outputContext) return "";
  outputContext.drawImage(canvas, sx, sy, width, height, 0, 0, width, height);
  return output.toDataURL("image/png");
}

export const SmoothSignatureCanvas = forwardRef<SmoothSignatureCanvasRef, { className?: string; onStroke?: () => void; onClear?: () => void }>(
  function SmoothSignatureCanvas({ className, onStroke, onClear }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePad | null>(null);
    const onStrokeRef = useRef(onStroke);
    const onClearRef = useRef(onClear);
    onStrokeRef.current = onStroke;
    onClearRef.current = onClear;

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pad = new SignaturePad(canvas, {
        penColor: "#111827",
        backgroundColor: "rgba(255,255,255,0)",
        minWidth: 1.15,
        maxWidth: 4.6,
        dotSize: 2.25,
        throttle: 0,
        minDistance: 0.5,
        velocityFilterWeight: 0.72,
      });
      pad.addEventListener("endStroke", () => onStrokeRef.current?.());
      padRef.current = pad;

      const resize = () => {
        if (!canvas.parentElement) return;
        const data = pad.isEmpty() ? null : pad.toData();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.round(canvas.parentElement.clientWidth * ratio);
        canvas.height = Math.round(canvas.parentElement.clientHeight * ratio);
        canvas.getContext("2d")?.scale(ratio, ratio);
        pad.clear();
        if (data) pad.fromData(data);
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas.parentElement);
      return () => { observer.disconnect(); pad.off(); };
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      getDataUrl: () => canvasRef.current ? croppedDataUrl(canvasRef.current) : "",
      clear: () => {
        padRef.current?.clear();
        onClearRef.current?.();
      },
      undo: () => {
        const pad = padRef.current;
        if (!pad) return;
        const strokes = pad.toData();
        if (strokes.length === 0) return;
        strokes.pop();
        pad.fromData(strokes);
        if (strokes.length === 0) onClearRef.current?.();
      },
    }), []);

    return (
      <div className={cn("relative h-[52dvh] min-h-72 overflow-hidden rounded-2xl bg-white", className)}>
        <div className="pointer-events-none absolute inset-x-10 top-[68%] border-t border-dashed border-slate-300" />
        <canvas ref={canvasRef} aria-label="Draw signature" className="relative h-full w-full cursor-crosshair touch-none select-none bg-transparent" />
      </div>
    );
  },
);
