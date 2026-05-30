import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { generateContractPdf } from "@/lib/contractPdf";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Signature canvas ──────────────────────────────────────────────────────────

interface SigRef {
  isEmpty: () => boolean;
  getDataUrl: () => string;
  clear: () => void;
}

const SignatureCanvas = forwardRef<SigRef, { onStroke?: () => void }>(
  function SignatureCanvas({ onStroke }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    const getXY = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ("touches" in e) {
        const t = e.touches[0];
        return {
          x: (t.clientX - rect.left) * scaleX,
          y: (t.clientY - rect.top) * scaleY,
        };
      }
      const me = e as React.MouseEvent;
      return {
        x: (me.clientX - rect.left) * scaleX,
        y: (me.clientY - rect.top) * scaleY,
      };
    };

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const pos = getXY(e);
      lastPos.current = pos;
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "#1a1a1a";
        ctx.fill();
      }
    };

    const drawLine = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing.current || !lastPos.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getXY(e);
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
    };

    const stopDraw = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      lastPos.current = null;
      onStroke?.();
    };

    useImperativeHandle(ref, () => ({
      isEmpty: () => {
        const canvas = canvasRef.current;
        if (!canvas) return true;
        const ctx = canvas.getContext("2d");
        if (!ctx) return true;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return false;
        }
        return true;
      },
      getDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? "",
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        className="w-full cursor-crosshair touch-none rounded-md border border-border"
        style={{ background: "#ffffff" }}
        onMouseDown={startDraw}
        onMouseMove={drawLine}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={drawLine}
        onTouchEnd={stopDraw}
      />
    );
  },
);

// ── Types ─────────────────────────────────────────────────────────────────────

type ContractForPdf = Parameters<typeof generateContractPdf>[0];

interface ContractSummary {
  clientName: string;
  carLabel: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  pdfData: ContractForPdf;
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface SignContractModalProps {
  contractId: string;
  clientName: string;
  open: boolean;
  onComplete: () => void;
}

export function SignContractModal({
  contractId,
  clientName,
  open,
  onComplete,
}: SignContractModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loadingData, setLoadingData] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [termsText, setTermsText] = useState("");
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [clientSigHasContent, setClientSigHasContent] = useState(false);
  const [managerSigHasContent, setManagerSigHasContent] = useState(false);
  // Captured when leaving step 2, because the step-2 canvas unmounts before step 3 renders
  const [clientSigDataUrl, setClientSigDataUrl] = useState("");
  // Captured in handleSave so it's available for the Download PDF button on step 4
  const [managerSigDataUrl, setManagerSigDataUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  const clientSigRef = useRef<SigRef>(null);
  const managerSigRef = useRef<SigRef>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setAgreed(false);
    setSaving(false);
    setClientSigHasContent(false);
    setManagerSigHasContent(false);
    setClientSigDataUrl("");
    setManagerSigDataUrl("");
    setSummary(null);
    setTermsText("");
    setLoadingData(true);

    const load = async () => {
      const [contractRes, { data: authData }] = await Promise.all([
        supabase
          .from("contracts")
          .select(
            "*, clients(full_name, phone, nationality, client_type, emirates_id, passport_number), cars(plate, make, model, year)",
          )
          .eq("id", contractId)
          .single(),
        supabase.auth.getUser(),
      ]);

      if (contractRes.data) {
        const d = contractRes.data as unknown as ContractForPdf & {
          clients: { full_name: string } | null;
          cars: { plate: string; make: string; model: string } | null;
        };
        setSummary({
          clientName: d.clients?.full_name ?? clientName,
          carLabel: d.cars ? `${d.cars.plate} — ${d.cars.make} ${d.cars.model}` : "—",
          startDate: d.start_date,
          endDate: d.end_date,
          totalAmount: Number(d.total_amount),
          pdfData: d as ContractForPdf,
        });
      }

      if (authData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("terms_en")
          .eq("id", authData.user.id)
          .single();
        const p = profile as { terms_en?: string | null } | null;
        setTermsText(p?.terms_en?.trim() ?? "");
      }

      setLoadingData(false);
    };

    load();
  }, [open, contractId, clientName]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  // onClick handler for "Complete & Save":
  // clientSigDataUrl is captured when leaving step 2 (before that canvas unmounts).
  // managerSigRef is still mounted on step 3, so we read it directly.
  const handleSave = async () => {
    console.log("handleSave called, contractId:", contractId);
    console.log("clientSigDataUrl length:", clientSigDataUrl?.length);
    console.log("managerSigRef.current:", managerSigRef.current);
    if (!clientSigDataUrl) {
      console.error("Client signature missing — was it captured on Next?");
      toast.error("Client signature missing. Please go back and sign again.");
      return;
    }
    if (!managerSigRef.current) {
      console.error("Manager canvas ref is null");
      toast.error("Manager signature canvas not found.");
      return;
    }
    const clientSignature = clientSigDataUrl;
    const managerSignature = managerSigRef.current.getDataUrl();
    console.log("Saving signatures, contractId:", contractId);
    console.log("Client sig length:", clientSignature.length);
    console.log("Manager sig length:", managerSignature.length);
    setSaving(true);
    const { data, error } = await supabase
      .from("contracts")
      .update({ client_signature: clientSignature, manager_signature: managerSignature })
      .eq("id", contractId);
    console.log("Save result:", data, error);
    setSaving(false);
    if (error) {
      toast.error("Failed to save signatures: " + error.message);
      return;
    }
    setManagerSigDataUrl(managerSignature);
    try {
      const blob = await generateContractPdf(
        {
          ...summary!.pdfData,
          client_signature: clientSignature,
          manager_signature: managerSignature,
        },
        { returnBlob: true },
      ) as Blob;
      const filePath = `${contractId}.pdf`;
      await supabase.storage.from("contract-pdfs").upload(filePath, blob, {
        contentType: "application/pdf",
        upsert: true,
      });
      const { data: publicData } = supabase.storage
        .from("contract-pdfs")
        .getPublicUrl(filePath);
      if (publicData?.publicUrl) setPdfUrl(publicData.publicUrl);
    } catch (err) {
      console.error("PDF upload failed:", err);
    }
    toast.success("Contract signed successfully");
    setStep(4);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onComplete(); }}>
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-lg">
        {/* Header with step indicator */}
        <DialogHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base">Sign Contract</DialogTitle>
            {step < 4 && (
              <div className="flex items-center gap-1">
                {([1, 2, 3] as const).map((s) => (
                  <div key={s} className="flex items-center gap-1">
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                        step === s
                          ? "bg-primary text-primary-foreground"
                          : step > s
                          ? "bg-primary/50 text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {step > s ? "✓" : s}
                    </div>
                    {s < 3 && (
                      <div className={cn("h-px w-5", step > s ? "bg-primary/50" : "bg-muted")} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Step 1: Summary + Terms ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {loadingData ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Client</div>
                      <div className="font-semibold">{summary?.clientName ?? clientName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Vehicle</div>
                      <div className="font-semibold">{summary?.carLabel ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Start Date</div>
                      <div className="font-medium">{summary ? fmtDate(summary.startDate) : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">End Date</div>
                      <div className="font-medium">{summary ? fmtDate(summary.endDate) : "—"}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Amount</div>
                      <div className="text-lg font-bold text-foreground">
                        AED {summary?.totalAmount.toLocaleString() ?? "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Terms &amp; Conditions
                    </div>
                    <div className="max-h-[200px] overflow-y-auto rounded-md border border-border bg-muted/20 p-3 text-xs leading-relaxed text-foreground/80 [scrollbar-width:thin]">
                      {termsText || "Please review the contract details above."}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                    />
                    <span className="text-sm text-foreground">
                      I have read and agree to the Terms &amp; Conditions
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Client Signature ── */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Client Signature</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Please sign below using your finger or mouse
                </p>
              </div>
              <SignatureCanvas
                ref={clientSigRef}
                onStroke={() => setClientSigHasContent(true)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
                  clientSigRef.current?.clear();
                  setClientSigHasContent(false);
                }}
              >
                Clear
              </Button>
            </div>
          )}

          {/* ── Step 3: Manager Signature ── */}
          {step === 3 && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Your Signature (Manager)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Please sign below using your finger or mouse
                </p>
              </div>
              <SignatureCanvas
                ref={managerSigRef}
                onStroke={() => setManagerSigHasContent(true)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
                  managerSigRef.current?.clear();
                  setManagerSigHasContent(false);
                }}
              >
                Clear
              </Button>
            </div>
          )}

          {/* ── Step 4: Success ── */}
          {step === 4 && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="rounded-full bg-tint-green p-4">
                <CheckCircle2 className="h-10 w-10 text-tint-green-foreground" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  Contract signed by both parties
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Signatures saved successfully.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-border px-6 py-4">
          {step === 1 && (
            <div className="flex justify-end">
              <Button disabled={!agreed || loadingData} onClick={() => setStep(2)}>
                Proceed to Sign →
              </Button>
            </div>
          )}
          {step === 2 && (
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button
                disabled={!clientSigHasContent}
                onClick={() => {
                  const dataUrl = clientSigRef.current?.getDataUrl() ?? "";
                  console.log("Captured client sig before unmount, length:", dataUrl.length);
                  setClientSigDataUrl(dataUrl);
                  setManagerSigHasContent(false);
                  setStep(3);
                }}
              >
                Next →
              </Button>
            </div>
          )}
          {step === 3 && (
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep(2);
                  setClientSigHasContent(false);
                }}
              >
                ← Back
              </Button>
              <Button disabled={!managerSigHasContent || saving} onClick={handleSave}>
                {saving ? "Saving..." : "Complete & Save"}
              </Button>
            </div>
          )}
          {step === 4 && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  if (!summary?.pdfData) return;
                  try {
                    await generateContractPdf({
                      ...summary.pdfData,
                      client_signature: clientSigDataUrl || null,
                      manager_signature: managerSigDataUrl || null,
                    });
                    toast.success("Contract PDF downloaded");
                  } catch {
                    toast.error("Failed to generate PDF");
                  }
                }}
              >
                Download PDF
              </Button>
              <Button
                className="gap-1.5 bg-green-600 text-white hover:bg-green-700"
                onClick={() => {
                  const raw = summary?.pdfData?.clients?.phone ?? "";
                  let phone = raw.replace(/[\s\-()]/g, "");
                  if (phone.startsWith("0")) {
                    phone = "+971" + phone.slice(1);
                  } else if (phone && !phone.startsWith("+")) {
                    phone = "+971" + phone;
                  }
                  const text = encodeURIComponent(
                    pdfUrl
                      ? `Your rental contract is ready: ${pdfUrl}`
                      : `Your rental contract is ready. Contract ID: ${contractId}`,
                  );
                  window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
                }}
              >
                <MessageCircle className="h-4 w-4" />
                Send via WhatsApp
              </Button>
              <Button onClick={onComplete}>Close</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
