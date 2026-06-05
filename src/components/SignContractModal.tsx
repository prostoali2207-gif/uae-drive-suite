import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CheckCircle2, FileText, MessageCircle } from "lucide-react";
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

interface SigRef {
  isEmpty: () => boolean;
  getDataUrl: () => string;
  clear: () => void;
}

const SignatureCanvas = forwardRef<SigRef, { onStroke?: () => void; className?: string }>(
  function SignatureCanvas({ onStroke, className }, ref) {
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
        ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
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
      ctx.lineWidth = 3;
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
        width={720}
        height={220}
        className={cn("h-44 w-full cursor-crosshair touch-none rounded-md border border-border sm:h-40", className)}
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

type ContractForPdf = Parameters<typeof generateContractPdf>[0];

interface ContractSummary {
  clientName: string;
  pdfData: ContractForPdf;
}

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
  const [step, setStep] = useState<"review" | "success">("review");
  const [loadingData, setLoadingData] = useState(true);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [clientSigHasContent, setClientSigHasContent] = useState(false);
  const [managerSigHasContent, setManagerSigHasContent] = useState(false);
  const [clientSigDataUrl, setClientSigDataUrl] = useState("");
  const [managerSigDataUrl, setManagerSigDataUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  const clientSigRef = useRef<SigRef>(null);
  const managerSigRef = useRef<SigRef>(null);

  useEffect(() => {
    if (!open) return;

    let objectUrl = "";
    let cancelled = false;

    setStep("review");
    setSaving(false);
    setClientSigHasContent(false);
    setManagerSigHasContent(false);
    setClientSigDataUrl("");
    setManagerSigDataUrl("");
    setSummary(null);
    setPreviewUrl("");
    setPdfUrl("");
    setLoadError("");
    setLoadingData(true);

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("contracts")
          .select(
            "*, clients(full_name, phone, nationality, client_type, emirates_id, passport_number, license_number), cars(plate, make, model, year)",
          )
          .eq("id", contractId)
          .single();

        if (error || !data) {
          const message = error?.message || "Contract was not found.";
          if (!cancelled) {
            setLoadError(message);
            toast.error("Could not open signature step: " + message);
          }
          return;
        }

        const pdfData = data as unknown as ContractForPdf;
        const client = pdfData.clients?.full_name ?? clientName;
        const previewBlob = await generateContractPdf(pdfData, { returnBlob: true }) as Blob;
        objectUrl = URL.createObjectURL(previewBlob);

        if (!cancelled) {
          setSummary({ clientName: client, pdfData });
          setPreviewUrl(objectUrl);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected signature step error.";
        if (!cancelled) {
          setLoadError(message);
          toast.error("Could not open signature step: " + message);
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, contractId, clientName]);

  const handleSave = async () => {
    if (!clientSigRef.current || clientSigRef.current.isEmpty()) {
      toast.error("Customer signature is required.");
      return;
    }
    if (!managerSigRef.current || managerSigRef.current.isEmpty()) {
      toast.error("Company representative signature is required.");
      return;
    }
    if (!summary?.pdfData) {
      toast.error("Contract details are not loaded. Please reopen the signature step.");
      return;
    }

    const clientSignature = clientSigRef.current.getDataUrl();
    const managerSignature = managerSigRef.current.getDataUrl();

    setSaving(true);
    const { error } = await supabase
      .from("contracts")
      .update({ client_signature: clientSignature, manager_signature: managerSignature })
      .eq("id", contractId);

    if (error) {
      setSaving(false);
      toast.error("Failed to save signatures: " + error.message);
      return;
    }

    setClientSigDataUrl(clientSignature);
    setManagerSigDataUrl(managerSignature);

    try {
      const blob = await generateContractPdf(
        {
          ...summary.pdfData,
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
    } finally {
      setSaving(false);
    }

    toast.success("Contract signed successfully");
    setStep("success");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onComplete(); }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[96vh] sm:w-[min(1180px,calc(100vw-2rem))] sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Review &amp; Sign Contract
            </DialogTitle>
            {step === "review" && (
              <div className="hidden text-xs font-medium text-muted-foreground sm:block">
                Review every page before saving signatures
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-muted/30 px-3 py-3 sm:px-6 sm:py-5">
          {step === "review" && (
            <div className="mx-auto flex max-w-6xl flex-col gap-4">
              {loadingData ? (
                <div className="rounded-md border border-border bg-background py-12 text-center text-sm text-muted-foreground">
                  Loading contract preview...
                </div>
              ) : loadError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  Could not load this contract for signing. {loadError}
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-border bg-background p-2 shadow-sm sm:p-3">
                    {previewUrl ? (
                      <iframe
                        title="Contract PDF preview"
                        src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                        className="h-[72dvh] min-h-[560px] w-full rounded-sm border-0 bg-white"
                      />
                    ) : (
                      <div className="py-12 text-center text-sm text-muted-foreground">
                        Preparing contract preview...
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border border-border bg-background p-4 shadow-sm sm:p-5">
                    <div className="mb-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                        Agreement &amp; Signatures
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        By signing below, both parties confirm they reviewed the complete contract preview above.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Customer Signature</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{summary?.clientName ?? clientName}</p>
                        </div>
                        <SignatureCanvas
                          ref={clientSigRef}
                          onStroke={() => setClientSigHasContent(true)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-10 w-fit"
                          onClick={() => {
                            clientSigRef.current?.clear();
                            setClientSigHasContent(false);
                          }}
                        >
                          Clear Customer Signature
                        </Button>
                      </div>
                      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Company Representative Signature</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Authorized representative</p>
                        </div>
                        <SignatureCanvas
                          ref={managerSigRef}
                          onStroke={() => setManagerSigHasContent(true)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-10 w-fit"
                          onClick={() => {
                            managerSigRef.current?.clear();
                            setManagerSigHasContent(false);
                          }}
                        >
                          Clear Company Signature
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "success" && (
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

        <div className="shrink-0 border-t border-border bg-background px-4 py-3 sm:px-6 sm:py-4">
          {step === "review" && (
            <div className="flex justify-end">
              <Button
                className="min-h-10"
                disabled={!clientSigHasContent || !managerSigHasContent || loadingData || !!loadError || saving}
                onClick={handleSave}
              >
                {saving ? "Saving..." : "Complete & Save"}
              </Button>
            </div>
          )}
          {step === "success" && (
            <div className="flex flex-wrap justify-end gap-2">
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
