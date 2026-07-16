import React, { forwardRef, useState, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";
import {
  generateReplacementAddendumPdf,
  replacementAddendumInspectionUrl,
  replacementAddendumResponsibilityClause,
  type ReplacementAddendumPdfData,
} from "@/lib/replacementAddendumPdf";
import type { Database } from "@/integrations/supabase/types";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  Calculator,
  Camera,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  ArrowLeft,
  X,
} from "lucide-react";
import {
  findVehicleContractOverlap,
  formatContractOverlapMessage,
  parseContractDateTime,
} from "@/lib/contractOverlap";

// Define the interface to support the missing contract_vehicles table
interface ExtendedDatabase extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      contract_vehicles: {
        Row: {
          id: string;
          contract_id: string;
          car_id: string;
          started_at: string;
          ended_at: string | null;
          owner_id: string;
          created_at: string;
          daily_rate: number | null;
          end_mileage: number | null;
          end_fuel_level: number | null;
          condition_note: string | null;
          sent_to_status: string | null;
          start_mileage: number | null;
          start_fuel_level: number | null;
          replacement_reason: string | null;
        };
        Insert: {
          id?: string;
          contract_id: string;
          car_id: string;
          started_at: string;
          ended_at?: string | null;
          owner_id: string;
          created_at?: string;
          daily_rate: number;
          end_mileage?: number | string | null;
          end_fuel_level?: number | string | null;
          condition_note?: string | null;
          sent_to_status?: string | null;
          start_mileage?: number | string | null;
          start_fuel_level?: number | string | null;
          replacement_reason?: string | null;
        };
        Update: {
          id?: string;
          contract_id?: string;
          car_id?: string;
          started_at?: string;
          ended_at?: string | null;
          owner_id?: string;
          created_at?: string;
          daily_rate?: number | null;
          end_mileage?: number | string | null;
          end_fuel_level?: number | string | null;
          condition_note?: string | null;
          sent_to_status?: string | null;
          start_mileage?: number | string | null;
          start_fuel_level?: number | string | null;
          replacement_reason?: string | null;
        };
        Relationships: [];
      };
    };
  };
}

interface ReplaceVehicleModalProps {
  contractId: string;
  currentCarId: string;
  contractStartDate: string; // ISO date string
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  presentation?: "dialog" | "page";
  contractSummary?: {
    contractNumber: string;
    clientName: string;
    currentVehicle: string;
    rentalPeriod: string;
  };
}

interface Car {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
}

interface ContractPeriod {
  id: string;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  rate_type: string;
  rate_amount: number | string;
}

interface ActiveVehiclePeriod {
  started_at: string;
  daily_rate: number | null;
}

interface ContractFeePeriod {
  id: string;
  label: string;
  amount: number;
  extension_start: string | null;
  extension_end: string | null;
  created_at: string | null;
}

interface VehicleRatePeriod {
  started_at: string;
  ended_at: string | null;
  daily_rate: number | null;
}

interface RentalPeriod {
  id: string;
  type: "contract" | "fee";
  start: string;
  end: string;
  amount: number;
  daily_rate: number;
}

const REPLACEMENT_INSPECTION_GROUPS = [
  {
    type: "replacement_old_return",
    title: "Old Vehicle Return Photos",
    pathSegment: "old-return",
  },
  {
    type: "replacement_new_handover",
    title: "Replacement Vehicle Handover Photos",
    pathSegment: "new-handover",
  },
] as const;
const MAX_REPLACEMENT_PHOTOS_PER_GROUP = 10;

type ReplacementInspectionType = (typeof REPLACEMENT_INSPECTION_GROUPS)[number]["type"];

interface ReplacementInspectionPhoto {
  id: string;
  type: ReplacementInspectionType;
  slot: string;
  photo_url: string;
  uploaded_at: string | null;
}

interface SignatureCanvasRef {
  isEmpty: () => boolean;
  getDataUrl: () => string;
  clear: () => void;
}

interface ReplacementAddendumSignatures {
  customerSignature: string;
  companySignature: string;
}

interface ReplacementAddendumPreviewData extends ReplacementAddendumPdfData {
  ownerId: string;
  clientPhone?: string | null;
  createdBy?: string | null;
}

function getReplacementAddendumErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const details = [record.message, record.error, record.details, record.hint]
      .filter(Boolean)
      .map(String)
      .join(" ");
    if (details) return details;
  }
  return "Failed to generate replacement addendum.";
}

function replacementPhotoStateKey(type: ReplacementInspectionType, id: string) {
  return `${type}:${id}`;
}

function replacementPhotoPath(
  contractId: string,
  replacementId: string,
  group: (typeof REPLACEMENT_INSPECTION_GROUPS)[number],
) {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${contractId}/replacement-${replacementId}/${group.pathSegment}/${Date.now()}-${suffix}.jpg`;
}

const ReplacementSignatureCanvas = forwardRef<
  SignatureCanvasRef,
  { onStroke?: () => void; className?: string }
>(function ReplacementSignatureCanvas({ onStroke, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const resetCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    resetCanvas();
  }, []);

  const getXY = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in event) {
      const touch = event.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    isDrawing.current = true;
    const pos = getXY(event);
    lastPos.current = pos;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
  };

  const drawLine = (event: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !lastPos.current) return;
    event.preventDefault();

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const pos = getXY(event);
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
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return true;

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return false;
      }
      return true;
    },
    getDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? "",
    clear: resetCanvas,
  }));

  return (
    <canvas
      ref={canvasRef}
      width={720}
      height={220}
      className={cn("h-36 w-full cursor-crosshair touch-none rounded-sm bg-white", className)}
      onMouseDown={startDraw}
      onMouseMove={drawLine}
      onMouseUp={stopDraw}
      onMouseLeave={stopDraw}
      onTouchStart={startDraw}
      onTouchMove={drawLine}
      onTouchEnd={stopDraw}
    />
  );
});

function ReplacementSignatureField({
  title,
  clearLabel,
  signatureRef,
  signed,
  onStroke,
  onClear,
}: {
  title: string;
  clearLabel: string;
  signatureRef: React.RefObject<SignatureCanvasRef | null>;
  signed: boolean;
  onStroke: () => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded border border-[#d6e0eb] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="text-[10px] font-bold uppercase tracking-normal text-[#005ab3]">{title}</Label>
        <span className={cn("text-[11px] font-medium", signed ? "text-[#005ab3]" : "text-[#566478]")}>
          {signed ? "Signed" : "Required"}
        </span>
      </div>
      <div className="rounded-sm border border-[#d6e0eb] bg-white p-1">
        <ReplacementSignatureCanvas ref={signatureRef} onStroke={onStroke} className="border border-[#edf2f7]" />
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 text-xs"
          onClick={() => {
            signatureRef.current?.clear();
            onClear();
          }}
        >
          {clearLabel}
        </Button>
      </div>
    </section>
  );
}

function ReplacementAddendumSignatureModal({
  open,
  onCancel,
  addendum,
  onSigned,
  onFinished,
}: {
  open: boolean;
  onCancel: () => void;
  addendum: ReplacementAddendumPreviewData | null;
  onSigned: (signatures: ReplacementAddendumSignatures) => Promise<string>;
  onFinished: () => void;
}) {
  const customerSignatureRef = useRef<SignatureCanvasRef>(null);
  const companySignatureRef = useRef<SignatureCanvasRef>(null);
  const [step, setStep] = useState<"review" | "success">("review");
  const [customerSigned, setCustomerSigned] = useState(false);
  const [companySigned, setCompanySigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [saveError, setSaveError] = useState("");
  const [signedSignatures, setSignedSignatures] = useState<ReplacementAddendumSignatures | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("review");
    setCustomerSigned(false);
    setCompanySigned(false);
    setSaving(false);
    setPdfUrl("");
    setSaveError("");
    setSignedSignatures(null);
  }, [open]);

  const handleComplete = async () => {
    if (!customerSignatureRef.current || !companySignatureRef.current) return;
    if (customerSignatureRef.current.isEmpty() || companySignatureRef.current.isEmpty()) return;
    if (!addendum) return;

    setSaving(true);
    setSaveError("");
    const signatures = {
      customerSignature: customerSignatureRef.current.getDataUrl(),
      companySignature: companySignatureRef.current.getDataUrl(),
    };
    try {
      const publicUrl = await onSigned(signatures);
      setSignedSignatures(signatures);
      setPdfUrl(publicUrl);
      setStep("success");
    } catch (error) {
      console.error("Replacement addendum signing failed", error);
      setSaveError(getReplacementAddendumErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!addendum || !signedSignatures) return;
    await generateReplacementAddendumPdf({
      ...addendum,
      customerSignature: signedSignatures.customerSignature,
      companySignature: signedSignatures.companySignature,
    });
  };

  const handleWhatsApp = () => {
    if (!addendum) return;
    const rawPhone = addendum.clientPhone ?? "";
    let phone = rawPhone.replace(/[\s\-()]/g, "");
    if (phone.startsWith("0")) {
      phone = `+971${phone.slice(1)}`;
    } else if (phone && !phone.startsWith("+")) {
      phone = `+971${phone}`;
    }
    const text = encodeURIComponent(
      pdfUrl
        ? `Replacement Addendum #${addendum.replacementNo} is signed: ${pdfUrl}`
        : `Replacement Addendum #${addendum.replacementNo} is signed for contract ${addendum.contractId}.`,
    );
    window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const detailRows = addendum
    ? [
        ["Company", addendum.company.name],
        ["Original Contract ID", addendum.contractId],
        ["Replacement No.", `#${addendum.replacementNo}`],
        ["Replacement Type", addendum.replacementType],
        ["Reason", addendum.reason],
        ["Replacement Date & Time", addendum.replacementDateTime],
      ]
    : [];
  const oldVehicle = addendum?.oldVehicle;
  const newVehicle = addendum?.newVehicle;
  const inspectionUrl = addendum ? replacementAddendumInspectionUrl(addendum.contractId) : "";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) (step === "success" ? onFinished() : onCancel()); }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-white/10 bg-[#0F1117] p-0 text-white sm:h-[96vh] sm:w-[min(980px,calc(100vw-2rem))] sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Review &amp; Sign Replacement Addendum
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Review the vehicle replacement addendum, then capture both signatures.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-black/20 px-3 py-3 sm:px-6 sm:py-5">
          {step === "review" && (
            <div className="mx-auto max-w-[794px] space-y-4">
              {!addendum ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  Replacement addendum details are not loaded. Please reopen the signature step.
                </div>
              ) : (
                <>
                  <section className="min-h-[880px] border border-[#d6e0eb] bg-white p-5 text-[#0f172a] shadow-sm sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-bold">{addendum.company.name}</div>
                        <div className="mt-1 text-xs text-[#005ab3]">Car Rental</div>
                      </div>
                      <div className="text-right text-[11px] text-[#566478]">
                        {addendum.company.phone && <div>{addendum.company.phone}</div>}
                        {addendum.company.email && <div className="break-all">{addendum.company.email}</div>}
                      </div>
                    </div>

                    <div className="mt-8">
                      <h2 className="text-2xl font-bold leading-tight">Vehicle Replacement Addendum</h2>
                      <p className="mt-2 text-xs text-[#566478]">Signed addendum to the original Rental Agreement.</p>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {detailRows.map(([label, value]) => (
                        <div key={label} className="rounded border border-[#d6e0eb] bg-[#f9fbfd] p-3">
                          <div className="text-[10px] uppercase text-[#566478]">{label}</div>
                          <div className="mt-1 break-words text-sm font-bold">{value || "-"}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-7 grid gap-4 md:grid-cols-2">
                      <section>
                        <h3 className="mb-3 text-xs font-bold uppercase text-[#005ab3]">Old Vehicle Return Details</h3>
                        <div className="divide-y divide-[#d6e0eb] rounded border border-[#d6e0eb]">
                          {[
                            ["Vehicle", [oldVehicle?.plate, oldVehicle?.make, oldVehicle?.model].filter(Boolean).join(" - ")],
                            ["Mileage", oldVehicle?.mileage ? `${oldVehicle.mileage} km` : ""],
                            ["Fuel", oldVehicle?.fuel],
                            ["Notes", oldVehicle?.notes],
                          ].map(([label, value]) => (
                            <div key={label} className="p-3">
                              <div className="text-[10px] text-[#566478]">{label}</div>
                              <div className="mt-1 break-words text-sm font-bold">{value || "-"}</div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-3 text-xs font-bold uppercase text-[#005ab3]">Replacement Vehicle Handover Details</h3>
                        <div className="divide-y divide-[#d6e0eb] rounded border border-[#d6e0eb]">
                          {[
                            ["Vehicle", [newVehicle?.plate, newVehicle?.make, newVehicle?.model].filter(Boolean).join(" - ")],
                            ["Mileage", newVehicle?.mileage ? `${newVehicle.mileage} km` : ""],
                            ["Fuel", newVehicle?.fuel],
                            ["Notes", newVehicle?.notes],
                          ].map(([label, value]) => (
                            <div key={label} className="p-3">
                              <div className="text-[10px] text-[#566478]">{label}</div>
                              <div className="mt-1 break-words text-sm font-bold">{value || "-"}</div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>

                    <div className="mt-6 rounded border border-[#d6e0eb] bg-[#f9fbfd] p-4">
                      <div className="text-xs font-bold text-[#005ab3]">Inspection Photos</div>
                      <div className="mt-2 break-all text-sm">{inspectionUrl}</div>
                    </div>

                    <div className="mt-6 rounded border border-[#d6e0eb] p-4">
                      <div className="text-xs font-bold uppercase text-[#005ab3]">Responsibility Transfer Clause</div>
                      <p className="mt-2 text-sm leading-relaxed">{replacementAddendumResponsibilityClause}</p>
                    </div>

                    <div className="mt-8">
                      <h3 className="mb-3 text-xs font-bold uppercase text-[#005ab3]">Agreement & Signatures</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <ReplacementSignatureField
                          title="Customer Signature"
                          clearLabel="Clear Customer Signature"
                          signatureRef={customerSignatureRef}
                          signed={customerSigned}
                          onStroke={() => setCustomerSigned(true)}
                          onClear={() => setCustomerSigned(false)}
                        />

                        <ReplacementSignatureField
                          title="Company Representative Signature"
                          clearLabel="Clear Company Signature"
                          signatureRef={companySignatureRef}
                          signed={companySigned}
                          onStroke={() => setCompanySigned(true)}
                          onClear={() => setCompanySigned(false)}
                        />
                      </div>
                    </div>
                  </section>

                  {saveError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      {saveError}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === "success" && (
            <div className="flex min-h-full flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="rounded-full bg-blue-400/10 p-4">
                <CheckCircle2 className="h-10 w-10 text-blue-200" aria-hidden="true" />
              </div>
              <div>
                <p className="text-base font-semibold text-white">Replacement Addendum signed successfully</p>
                <p className="mt-1 text-sm text-white/60">The signed PDF was uploaded and saved in Documents.</p>
              </div>
            </div>
          )}
        </div>

        {step === "review" && (
          <div className="shrink-0 border-t border-white/10 bg-[#0F1117] px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="text-white/60 hover:bg-white/5 hover:text-white" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                className="min-h-10 bg-[#4f6ef7] text-white hover:bg-[#4f6ef7]/90"
                disabled={!addendum || !customerSigned || !companySigned || saving}
                onClick={handleComplete}
              >
                {saving ? "Generating..." : "Complete & Save Addendum"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="shrink-0 border-t border-white/10 bg-[#0F1117] px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="gap-1.5" onClick={handleDownload}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download PDF
              </Button>
              <Button type="button" className="gap-1.5 bg-green-600 text-white hover:bg-green-700" onClick={handleWhatsApp}>
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Send via WhatsApp
              </Button>
              <Button type="button" onClick={onFinished}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReplacementInspectionModal({
  contractId,
  replacementId,
  uploadedBy,
  open,
  onCancel,
  onComplete,
}: {
  contractId: string;
  replacementId: string;
  uploadedBy: string | null;
  open: boolean;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const [photos, setPhotos] = useState<ReplacementInspectionPhoto[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadingKey, setUploadingKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const photosByType = useMemo(() => {
    const grouped: Record<ReplacementInspectionType, ReplacementInspectionPhoto[]> = {
      replacement_old_return: [],
      replacement_new_handover: [],
    };
    photos.forEach((photo) => {
      grouped[photo.type].push(photo);
    });
    return grouped;
  }, [photos]);

  const oldVehiclePhotoCount = photosByType.replacement_old_return.length;
  const replacementVehiclePhotoCount = photosByType.replacement_new_handover.length;
  const completedGroups = REPLACEMENT_INSPECTION_GROUPS.filter((group) => photosByType[group.type].length > 0).length;
  const progressValue = (completedGroups / REPLACEMENT_INSPECTION_GROUPS.length) * 100;

  useEffect(() => {
    if (!open || !contractId || !replacementId) return;

    let cancelled = false;
    const loadPhotos = async () => {
      const { data, error } = await (supabase as any)
        .from("contract_inspections")
        .select("id, type, slot, photo_url, uploaded_at")
        .eq("contract_id", contractId)
        .in("type", REPLACEMENT_INSPECTION_GROUPS.map((group) => group.type));

      if (cancelled) return;
      if (error) {
        setErrors((prev) => ({ ...prev, load: "Could not load replacement inspection photos." }));
        return;
      }

      const scopedPhotos = ((data ?? []) as ReplacementInspectionPhoto[]).filter((photo) =>
        photo.photo_url?.startsWith(`${contractId}/replacement-${replacementId}/`),
      );
      setPhotos(scopedPhotos);
      setErrors((prev) => ({ ...prev, load: "" }));
    };

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [contractId, open, replacementId]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadPreviews = async () => {
      const nextPreviews: Record<string, string> = {};
      await Promise.all(
        photos.map(async (photo) => {
          const key = replacementPhotoStateKey(photo.type, photo.id);
          if (!photo.photo_url) return;
          if (/^(https?:|data:|blob:)/.test(photo.photo_url)) {
            nextPreviews[key] = photo.photo_url;
            return;
          }
          const { data } = supabase.storage
            .from("inspection-photos")
            .getPublicUrl(photo.photo_url);
          if (data?.publicUrl) nextPreviews[key] = data.publicUrl;
        }),
      );
      if (!cancelled) setPreviews(nextPreviews);
    };

    loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [photos, open]);

  const handleUpload = async (
    group: (typeof REPLACEMENT_INSPECTION_GROUPS)[number],
    fileList: FileList | null,
  ) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const groupPhotos = photosByType[group.type];
    const availableSlots = MAX_REPLACEMENT_PHOTOS_PER_GROUP - groupPhotos.length;
    const filesToUpload = files.slice(0, Math.max(availableSlots, 0));
    const stateKey = replacementPhotoStateKey(group.type, "upload");

    if (!filesToUpload.length) {
      setErrors((prev) => ({ ...prev, [stateKey]: "Maximum 10 photos reached." }));
      return;
    }

    const highestSlot = groupPhotos.reduce((highest, photo) => {
      const numericSlot = Number.parseInt(photo.slot, 10);
      return Number.isFinite(numericSlot) ? Math.max(highest, numericSlot) : highest;
    }, 0);
    const insertedPhotos: ReplacementInspectionPhoto[] = [];
    setUploadingKey(stateKey);
    setErrors((prev) => ({
      ...prev,
      [stateKey]: files.length > filesToUpload.length ? "Only 10 photos can be saved per group." : "",
    }));

    for (let index = 0; index < filesToUpload.length; index += 1) {
      const file = filesToUpload[index];
      const slot = String(highestSlot + index + 1);
      const path = replacementPhotoPath(contractId, replacementId, group);
      const uploadFile = await prepareImageForStorageUpload(file);
      logImageCompressionUpload("ReplaceVehicleModal", file, uploadFile, path);
      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(path, uploadFile, {
          contentType: uploadFile.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        setUploadingKey("");
        setErrors((prev) => ({ ...prev, [stateKey]: uploadError.message }));
        return;
      }

      const payload = {
        contract_id: contractId,
        type: group.type,
        slot,
        photo_url: path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploadedBy,
      };
      const { data, error: saveError } = await (supabase as any)
        .from("contract_inspections")
        .insert(payload)
        .select("id, type, slot, photo_url, uploaded_at")
        .single();

      if (saveError) {
        setUploadingKey("");
        setErrors((prev) => ({ ...prev, [stateKey]: saveError.message }));
        return;
      }

      if (data) insertedPhotos.push(data as ReplacementInspectionPhoto);
    }

    setUploadingKey("");
    if (insertedPhotos.length) {
      setPhotos((prev) => [...prev, ...insertedPhotos]);
    }
    setErrors((prev) => ({
      ...prev,
      [stateKey]: files.length > filesToUpload.length ? "Only 10 photos can be saved per group." : "",
    }));
  };

  const handleDelete = async (photo: ReplacementInspectionPhoto) => {
    const stateKey = replacementPhotoStateKey(photo.type, photo.id);
    setUploadingKey(stateKey);
    setErrors((prev) => ({ ...prev, [stateKey]: "" }));

    const { error: storageError } = await supabase.storage
      .from("inspection-photos")
      .remove([photo.photo_url]);

    if (storageError) {
      setUploadingKey("");
      setErrors((prev) => ({ ...prev, [stateKey]: storageError.message }));
      return;
    }

    const { error: deleteError } = await (supabase as any)
      .from("contract_inspections")
      .delete()
      .eq("id", photo.id);

    setUploadingKey("");
    if (deleteError) {
      setErrors((prev) => ({ ...prev, [stateKey]: deleteError.message }));
      return;
    }

    setPhotos((prev) => prev.filter((item) => item.id !== photo.id));
  };

  const isComplete = completedGroups === REPLACEMENT_INSPECTION_GROUPS.length;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto bg-[#0F1117] border-white/10 text-white sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Replacement Inspection Photos</DialogTitle>
          <DialogDescription className="text-white/60">
            Capture old vehicle return and replacement vehicle handover photos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-white/55">
              <span>Inspection photos</span>
              <span className="font-ibm-plex-mono text-blue-300">{completedGroups} / {REPLACEMENT_INSPECTION_GROUPS.length} groups</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${progressValue}%` }} />
            </div>
            <div className="mt-2 text-xs text-white/50">
              Old Vehicle: {oldVehiclePhotoCount} photos &middot; Replacement Vehicle: {replacementVehiclePhotoCount} photos
            </div>
            {errors.load && <div className="mt-2 text-xs text-red-300">{errors.load}</div>}
          </div>

          {REPLACEMENT_INSPECTION_GROUPS.map((group) => {
            const groupPhotos = photosByType[group.type];
            const uploadKey = replacementPhotoStateKey(group.type, "upload");
            const isUploading = uploadingKey === uploadKey;
            const isAtLimit = groupPhotos.length >= MAX_REPLACEMENT_PHOTOS_PER_GROUP;
            const groupError = errors[uploadKey];

            return (
              <section key={group.type} className="rounded-md border border-white/10 bg-white/[0.03]">
                <div className="border-b border-white/10 px-3 py-2">
                  <h3 className="text-sm font-semibold text-white/90">{group.title}</h3>
                </div>
                <div className="space-y-3 p-3">
                  {groupPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {groupPhotos.map((photo) => {
                        const photoKey = replacementPhotoStateKey(photo.type, photo.id);
                        const preview = previews[photoKey];
                        const isDeleting = uploadingKey === photoKey;
                        const photoError = errors[photoKey];

                        return (
                          <div key={photo.id} className="min-w-0">
                            <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-white/10 bg-[#1a1a1a]">
                              {preview ? (
                                <img
                                  src={preview}
                                  alt={`${group.title} ${photo.slot}`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center border border-dashed border-white/10 bg-white/[0.03] text-white/40">
                                  <ImageIcon className="h-7 w-7" />
                                </div>
                              )}
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute right-1 top-1 h-7 w-7"
                                disabled={isDeleting}
                                onClick={() => handleDelete(photo)}
                                aria-label="Delete photo"
                              >
                                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                            {photo.uploaded_at && (
                              <div className="mt-1 truncate text-[10px] text-white/40">
                                Uploaded {new Date(photo.uploaded_at).toLocaleString("en-GB")}
                              </div>
                            )}
                            {photoError && <div className="mt-1 text-[11px] text-red-300">{photoError}</div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center rounded-md border border-dashed border-white/10 bg-[#1a1a1a] text-white/40">
                      <ImageIcon className="h-7 w-7" />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={(node) => {
                        inputRefs.current[uploadKey] = node;
                      }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        handleUpload(group, event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10 shrink-0 gap-1.5 px-2 text-xs text-blue-200 hover:bg-blue-400/10 hover:text-blue-100"
                      disabled={isUploading || isAtLimit}
                      onClick={() => inputRefs.current[uploadKey]?.click()}
                    >
                      {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                      {isUploading ? "Uploading..." : "Add Photos"}
                    </Button>
                    <span className="font-ibm-plex-mono text-xs text-white/50">
                      {groupPhotos.length}/{MAX_REPLACEMENT_PHOTOS_PER_GROUP}
                    </span>
                  </div>
                  {groupError && <div className="text-[11px] text-red-300">{groupError}</div>}
                </div>
              </section>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="min-h-10 bg-[#4f6ef7] text-white hover:bg-[#4f6ef7]/90"
            disabled={!isComplete}
            onClick={onComplete}
          >
            Continue to Sign Addendum
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function splitDatetimeLocal(value: string) {
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  };
}

const DAY_MS = 86_400_000;

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const calculateInclusiveDays = (start: Date, end: Date) => {
  const startDay = startOfLocalDay(start);
  const endDay = startOfLocalDay(end);
  const diffDays = Math.floor((endDay.getTime() - startDay.getTime()) / DAY_MS) + 1;
  return Math.max(0, diffDays);
};

const calculateInclusiveDateKeyDays = (startKey: string, endKey: string) =>
  calculateInclusiveDays(new Date(`${startKey}T00:00:00`), new Date(`${endKey}T00:00:00`));

const formatAed = (amount: number) =>
  Number.isFinite(amount)
    ? amount.toLocaleString("en-AE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "--";

const formatAddendumDateTime = (value: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ");
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", " -");
};

const formatFuelLevelLabel = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric === 100) return "Full";
    if (numeric === 75) return "3/4";
    if (numeric === 50) return "1/2";
    if (numeric === 25) return "1/4";
    if (numeric === 0) return "Empty";
  }
  return String(value);
};

function calculateContractDailyRate(rateType: string, rateAmount: number | string) {
  const amount = Number(rateAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  switch (rateType) {
    case "Monthly":
      return amount / 30;
    case "Yearly":
      return Math.round(amount / 365);
    default:
      return Math.round(amount);
  }
}

const parseRentalExtensionPeriod = (label: string) => {
  const match = label
    .trim()
    .match(/^Rental Extension:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/i);

  if (!match) return null;
  return { periodStart: match[1], periodEnd: match[2] };
};

const isInsidePeriod = (date: Date, start: Date, end: Date) =>
  date >= start && date <= end;

const toLocalDateKey = (date: Date) => date.toLocaleDateString("en-CA");

const isInsideLocalDatePeriod = (date: Date, start: Date, end: Date) =>
  toLocalDateKey(date) >= toLocalDateKey(start) && toLocalDateKey(date) <= toLocalDateKey(end);

const toPeriodDateKey = (date: string) => date.split("T")[0];

const isInsideRentalPeriod = (dateKey: string, period: RentalPeriod) =>
  dateKey >= toPeriodDateKey(period.start) && dateKey <= toPeriodDateKey(period.end);

const calculateOverlapDays = (start: Date, end: Date, periodStart: Date, periodEnd: Date) => {
  const overlapStart = new Date(Math.max(start.getTime(), periodStart.getTime()));
  const overlapEnd = new Date(Math.min(end.getTime(), periodEnd.getTime()));
  const diffMs = overlapEnd.getTime() - overlapStart.getTime();

  if (diffMs <= 0) return 0;
  return diffMs / 86_400_000;
};

const calculatePeriodDays = (periodStart: Date, periodEnd: Date) =>
  Math.max(0, (periodEnd.getTime() - periodStart.getTime()) / 86_400_000);

const calculateFixedMonthlyBillableDays = (periodStart: Date, periodEnd: Date) => {
  const calendarDays = calculatePeriodDays(periodStart, periodEnd);
  const wholeMonths =
    periodStart.getDate() === periodEnd.getDate()
      ? (periodEnd.getFullYear() - periodStart.getFullYear()) * 12 +
        (periodEnd.getMonth() - periodStart.getMonth())
      : 0;

  if (wholeMonths > 0) return wholeMonths * 30;
  if (calendarDays >= 28 && calendarDays <= 31) return 30;
  return calendarDays;
};

const calculateRentalPeriodAmount = (
  vehicles: VehicleRatePeriod[],
  periodStart: Date,
  periodEnd: Date,
) => {
  const calendarDays = calculatePeriodDays(periodStart, periodEnd);
  const billableDays = calculateFixedMonthlyBillableDays(periodStart, periodEnd);
  const billableScale = calendarDays > 0 ? billableDays / calendarDays : 0;

  return Math.round(
    vehicles.reduce((sum, vehicle) => {
      const dailyRate = Number(vehicle.daily_rate);
      if (!Number.isFinite(dailyRate) || dailyRate <= 0) return sum;

      const vehicleStart = new Date(vehicle.started_at);
      const vehicleEnd = vehicle.ended_at ? new Date(vehicle.ended_at) : periodEnd;
      if (Number.isNaN(vehicleStart.getTime()) || Number.isNaN(vehicleEnd.getTime())) return sum;

      return sum + calculateOverlapDays(vehicleStart, vehicleEnd, periodStart, periodEnd) * billableScale * dailyRate;
    }, 0),
  );
};

export const ReplaceVehicleModal: React.FC<ReplaceVehicleModalProps> = ({
  contractId,
  currentCarId,
  contractStartDate,
  isOpen,
  onClose,
  onSuccess,
  presentation = "dialog",
  contractSummary,
}) => {
  const { toast } = useToast();
  const isPage = presentation === "page";
  
  const [availableCars, setAvailableCars] = useState<Car[]>([]);
  const [loadingCars, setLoadingCars] = useState(false);
  const [currentCar, setCurrentCar] = useState<Car | null>(null);
  const [loadingCurrentCar, setLoadingCurrentCar] = useState(false);
  const [loadingRentalPeriods, setLoadingRentalPeriods] = useState(false);
  const [rentalPeriods, setRentalPeriods] = useState<RentalPeriod[]>([]);
  const [selectedNewCarId, setSelectedNewCarId] = useState<string>("");
  const [newVehicleComboboxOpen, setNewVehicleComboboxOpen] = useState(false);
  const [newVehicleSearch, setNewVehicleSearch] = useState("");
  
  const [replacementTime, setReplacementTime] = useState<string>("");
  const [endMileage, setEndMileage] = useState("");
  const [endFuelLevel, setEndFuelLevel] = useState("");
  const [conditionNote, setConditionNote] = useState("");
  const [sentToStatus, setSentToStatus] = useState("Available");
  const [startMileage, setStartMileage] = useState("");
  const [startFuelLevel, setStartFuelLevel] = useState("");
  const [replacementReason, setReplacementReason] = useState("");
  const [replacementType, setReplacementType] = useState("Permanent");
  const [currentMonthlyPrice, setCurrentMonthlyPrice] = useState<string>("");
  const [monthlyPrice, setMonthlyPrice] = useState<string>("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [replacementInspectionOpen, setReplacementInspectionOpen] = useState(false);
  const [replacementInspectionId, setReplacementInspectionId] = useState("");
  const [replacementInspectionUploadedBy, setReplacementInspectionUploadedBy] = useState<string | null>(null);
  const [replacementSignatureOpen, setReplacementSignatureOpen] = useState(false);
  const [replacementAddendumData, setReplacementAddendumData] =
    useState<ReplacementAddendumPreviewData | null>(null);

  const currentMonthlyPriceNumber = Number(currentMonthlyPrice);
  const currentPreviewDailyRate =
    Number.isFinite(currentMonthlyPriceNumber) && currentMonthlyPriceNumber > 0
      ? currentMonthlyPriceNumber / 30
      : 0;
  const monthlyPriceNumber = Number(monthlyPrice);
  const previewDailyRate =
    Number.isFinite(monthlyPriceNumber) && monthlyPriceNumber > 0
      ? monthlyPriceNumber / 30
      : 0;
  const swapCostPreview = useMemo(() => {
    const swapDate = new Date(replacementTime);
    if (Number.isNaN(swapDate.getTime())) return null;
    const swapDateKey = toLocalDateKey(swapDate);

    const containingPeriod = rentalPeriods.find((period) => isInsideRentalPeriod(swapDateKey, period));

    if (!containingPeriod) return null;

    const periodStartKey = toPeriodDateKey(containingPeriod.start);
    const periodEndKey = toPeriodDateKey(containingPeriod.end);
    if (!periodStartKey || !periodEndKey) return null;

    const oldCarDays = Math.min(calculateInclusiveDateKeyDays(periodStartKey, swapDateKey), 30);
    const newCarDays = Math.min(calculateInclusiveDateKeyDays(swapDateKey, periodEndKey), 30);
    const oldCarDailyRate = currentPreviewDailyRate;
    const newCarDailyRate = previewDailyRate;
    const oldCarTotal =
      Number.isFinite(oldCarDailyRate) && oldCarDailyRate > 0 ? oldCarDays * oldCarDailyRate : 0;
    const newCarTotal =
      Number.isFinite(newCarDailyRate) && newCarDailyRate > 0 ? newCarDays * newCarDailyRate : 0;

    return {
      oldCarDays,
      oldCarDailyRate,
      oldCarTotal,
      newCarDays,
      newCarDailyRate,
      newCarTotal,
      total: oldCarTotal + newCarTotal,
    };
  }, [currentPreviewDailyRate, previewDailyRate, replacementTime, rentalPeriods]);

  const selectedNewCar = availableCars.find((car) => car.id === selectedNewCarId);
  const filteredAvailableCars = useMemo(() => {
    const query = newVehicleSearch.trim().toLowerCase();
    if (!query) return availableCars;

    return availableCars.filter((car) => {
      const vehicleText = `${car.plate} ${car.make} ${car.model}`.toLowerCase();
      return vehicleText.includes(query);
    });
  }, [availableCars, newVehicleSearch]);

  const handleReplacementReasonChange = (value: string) => {
    setReplacementReason(value);

    if (["Breakdown", "Accident"].includes(value)) {
      setSentToStatus("Service");
      return;
    }

    if (["Customer request", "Upgrade", "Company decision"].includes(value)) {
      setSentToStatus("Available");
    }
  };

  // Helper to format a Date object into local datetime-local string (YYYY-MM-DDTHH:MM)
  const formatDatetimeLocal = (date: Date) => {
    const pad = (num: number) => String(num).padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  // Reset values when modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const formatted = formatDatetimeLocal(now);
      setReplacementTime(formatted);
      setSelectedNewCarId("");
      setNewVehicleComboboxOpen(false);
      setNewVehicleSearch("");
      setEndMileage("");
      setEndFuelLevel("");
      setConditionNote("");
      setSentToStatus("Available");
      setStartMileage("");
      setStartFuelLevel("");
      setReplacementReason("");
      setReplacementType("Permanent");
      setCurrentCar(null);
      setCurrentMonthlyPrice("");
      setMonthlyPrice("");
      setRentalPeriods([]);
      setReplacementInspectionOpen(false);
      setReplacementInspectionId("");
      setReplacementInspectionUploadedBy(null);
      setReplacementSignatureOpen(false);
      setReplacementAddendumData(null);
      
      const fetchModalData = async () => {
        setLoadingCars(true);
        setLoadingCurrentCar(true);
        setLoadingRentalPeriods(true);
        try {
          const extendedDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;
          const [availableRes, currentRes, contractRes, feePeriodsRes, activeVehicleRes] = await Promise.all([
            supabase
              .from("cars")
              .select("id, plate, make, model, year")
              .eq("status", "Available")
              .order("plate"),
            supabase
              .from("cars")
              .select("id, plate, make, model, year")
              .eq("id", currentCarId)
              .maybeSingle(),
            extendedDb
              .from("contracts")
              .select("id, start_date, start_time, end_date, end_time, rate_type, rate_amount")
              .eq("id", contractId)
              .maybeSingle(),
            (extendedDb as any)
              .from("contract_fees")
              .select("id, amount, extension_start, extension_end, created_at")
              .eq("contract_id", contractId)
              .not("extension_start", "is", null)
              .order("extension_start", { ascending: true }),
            extendedDb
              .from("contract_vehicles")
              .select("daily_rate")
              .eq("contract_id", contractId)
              .eq("car_id", currentCarId)
              .is("ended_at", null)
              .maybeSingle(),
          ]);

          if (availableRes.error) throw availableRes.error;
          setAvailableCars((availableRes.data as Car[]) || []);

          if (currentRes.error) throw currentRes.error;
          setCurrentCar(currentRes.data as Car | null);

          if (contractRes.error) throw contractRes.error;
          if (feePeriodsRes.error) throw feePeriodsRes.error;
          if (activeVehicleRes.error) throw activeVehicleRes.error;
          const activeVehicleDailyRate = Number((activeVehicleRes.data as ActiveVehiclePeriod | null)?.daily_rate);
          setCurrentMonthlyPrice(
            Number.isFinite(activeVehicleDailyRate) && activeVehicleDailyRate > 0
              ? String(activeVehicleDailyRate * 30)
              : "",
          );
          const contractPeriod = contractRes.data as ContractPeriod | null;
          const contractDailyRate = contractPeriod
            ? calculateContractDailyRate(contractPeriod.rate_type, contractPeriod.rate_amount)
            : 0;
          const originalPeriod =
            contractPeriod && contractDailyRate > 0
              ? [
                  {
                    id: contractPeriod.id,
                    type: "contract" as const,
                    start: contractPeriod.start_date,
                    end: contractPeriod.end_date,
                    amount: contractDailyRate * 30,
                    daily_rate: contractDailyRate,
                  },
                ]
              : [];
          const extensionPeriods = ((feePeriodsRes.data ?? []) as ContractFeePeriod[])
            .filter((fee) => fee.extension_start && fee.extension_end)
            .map((fee) => ({
              id: fee.id,
              type: "fee" as const,
              start: fee.extension_start!,
              end: fee.extension_end!,
              amount: Number(fee.amount),
              daily_rate: Number(fee.amount) / 30,
            }))
            .filter((period) => Number.isFinite(period.daily_rate) && period.daily_rate > 0);
          setRentalPeriods([...originalPeriod, ...extensionPeriods]);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("Error fetching modal data:", err);
          toast({
            title: "Error",
            description: `Failed to load vehicles data: ${message}`,
            variant: "destructive",
          });
        } finally {
          setLoadingCars(false);
          setLoadingCurrentCar(false);
          setLoadingRentalPeriods(false);
        }
      };

      fetchModalData();
    }
  }, [isOpen, contractId, currentCarId, toast]);

  const handleConfirm = async () => {
    if (!selectedNewCarId) return;
    if (!Number.isFinite(monthlyPriceNumber) || monthlyPriceNumber <= 0) {
      toast({
        title: "Monthly price required",
        description: "Enter a positive monthly price for the replacement vehicle.",
        variant: "destructive",
      });
      return;
    }
    const dailyRate = Number(monthlyPrice) / 30;

    setConfirmLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user session found");
      const userId = user.id;

      // Cast supabase client to ExtendedDatabase to handle contract_vehicles
      const extendedDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;

      const replacement = splitDatetimeLocal(replacementTime);
      const [
        { data: contractPeriod, error: contractPeriodError },
        { data: activeVehicle, error: activeVehicleError },
        { data: feePeriods, error: feePeriodsError },
      ] =
        await Promise.all([
          extendedDb
            .from("contracts")
            .select("id, start_date, start_time, end_date, end_time, rate_type, rate_amount")
            .eq("id", contractId)
            .single(),
          extendedDb
            .from("contract_vehicles")
            .select("started_at, daily_rate")
            .eq("contract_id", contractId)
            .eq("car_id", currentCarId)
            .is("ended_at", null)
            .maybeSingle(),
          (extendedDb as any)
            .from("contract_fees")
            .select("id, label, amount, extension_start, extension_end, created_at")
            .eq("contract_id", contractId)
            .order("created_at", { ascending: true }),
        ]);
      if (contractPeriodError) throw contractPeriodError;
      if (activeVehicleError) throw activeVehicleError;
      if (feePeriodsError) throw feePeriodsError;

      const period = contractPeriod as ContractPeriod;
      const currentVehicleStartedAt =
        (activeVehicle as ActiveVehiclePeriod | null)?.started_at ??
        parseContractDateTime(period.start_date, period.start_time).toISOString();
      const replacementDate = new Date(replacementTime);
      const replacementDateKey = toLocalDateKey(replacementDate);
      const contractStart = parseContractDateTime(period.start_date, period.start_time);
      const contractEnd = parseContractDateTime(period.end_date, period.end_time);
      const currentVehicleStart = new Date(currentVehicleStartedAt);
      const activeVehicleDailyRate = Number((activeVehicle as ActiveVehiclePeriod | null)?.daily_rate);
      const currentVehicleDailyRate =
        Number.isFinite(activeVehicleDailyRate) && activeVehicleDailyRate > 0
          ? activeVehicleDailyRate
          : calculateContractDailyRate(period.rate_type, period.rate_amount);

      const contractDailyRate = calculateContractDailyRate(period.rate_type, period.rate_amount);
      const validationRentalPeriods: RentalPeriod[] = [
        {
          id: period.id,
          type: "contract",
          start: period.start_date,
          end: period.end_date,
          amount: contractDailyRate * 30,
          daily_rate: contractDailyRate,
        },
        ...((feePeriods ?? []) as ContractFeePeriod[])
          .filter((fee) => fee.extension_start && fee.extension_end)
          .map((fee) => ({
            id: fee.id,
            type: "fee" as const,
            start: fee.extension_start!,
            end: fee.extension_end!,
            amount: Number(fee.amount),
            daily_rate: Number(fee.amount) / 30,
          })),
      ];
      const matchingRentalPeriod = validationRentalPeriods.find((rentalPeriod) =>
        isInsideRentalPeriod(replacementDateKey, rentalPeriod),
      );

      if (Number.isNaN(replacementDate.getTime()) || !matchingRentalPeriod) {
        toast({
          title: "Invalid replacement time",
          description: "Replacement date and time must be inside the contract period.",
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      const activeRentalTarget =
        matchingRentalPeriod.type === "fee"
          ? {
              type: "fee" as const,
              id: matchingRentalPeriod.id,
              periodStart: parseContractDateTime(matchingRentalPeriod.start, period.end_time),
              periodEnd: parseContractDateTime(matchingRentalPeriod.end, period.end_time),
            }
          : {
              type: "contract" as const,
              periodStart: contractStart,
              periodEnd: contractEnd,
            };

      if (!activeRentalTarget) {
        toast({
          title: "Rental period not found",
          description: "Could not find the active rental charge for this replacement date.",
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      if (Number.isNaN(currentVehicleStart.getTime()) || replacementDate < currentVehicleStart) {
        toast({
          title: "Invalid replacement time",
          description: "Replacement date and time must be after the current vehicle start time.",
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      const replacementTimestamp = new Date(`${replacement.date}T${replacement.time}:00+04:00`).toISOString();

      const conflict = await findVehicleContractOverlap(extendedDb, {
        carId: selectedNewCarId,
        startDate: replacement.date,
        startTime: replacement.time,
        endDate: matchingRentalPeriod.end,
        endTime: period.end_time,
        excludeContractId: contractId,
        operation: "vehicle-replacement",
      });
      if (conflict) {
        toast({
          title: "Vehicle unavailable",
          description: formatContractOverlapMessage(conflict),
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      // a. Close the active contract_vehicles row for the old car
      const { data: closedVehicles, error: errOldVehicle } = await extendedDb
        .from("contract_vehicles")
        .update({
          ended_at: replacementTimestamp,
          end_mileage: endMileage || null,
          end_fuel_level: endFuelLevel || null,
          condition_note: conditionNote || null,
          sent_to_status: sentToStatus,
        })
        .eq("contract_id", contractId)
        .eq("car_id", currentCarId)
        .is("ended_at", null)
        .select("id");
      if (errOldVehicle) throw errOldVehicle;

      if (!closedVehicles || closedVehicles.length === 0) {
        const { error: errOldVehicleInsert } = await extendedDb
          .from("contract_vehicles")
          .insert({
            contract_id: contractId,
            car_id: currentCarId,
            started_at: currentVehicleStartedAt,
            ended_at: replacementTimestamp,
            owner_id: userId,
            daily_rate: currentVehicleDailyRate,
            end_mileage: endMileage || null,
            end_fuel_level: endFuelLevel || null,
            condition_note: conditionNote || null,
            sent_to_status: sentToStatus,
          });
        if (errOldVehicleInsert) throw errOldVehicleInsert;
      }

      // b. Update contracts table: set car_id = selectedNewCarId where id = contractId
      const { error: errContract } = await extendedDb
        .from("contracts")
        .update({ car_id: selectedNewCarId })
        .eq("id", contractId);
      if (errContract) throw errContract;

      // c. Update old car in cars table: set status = 'Available' where id = currentCarId
      const { error: errOldCar } = await extendedDb
        .from("cars")
        .update({ status: sentToStatus })
        .eq("id", currentCarId);
      if (errOldCar) throw errOldCar;

      // d. Update new car in cars table: set status = 'Rented' where id = selectedNewCarId
      const { error: errNewCar } = await extendedDb
        .from("cars")
        .update({ status: "Rented" })
        .eq("id", selectedNewCarId);
      if (errNewCar) throw errNewCar;

      // e. Insert a row into contract_vehicles table for new car start
      const { data: newVehicleRow, error: errNewVehicle } = await extendedDb
        .from("contract_vehicles")
        .insert({
          contract_id: contractId,
          car_id: selectedNewCarId,
          started_at: replacementTimestamp,
          ended_at: null,
          owner_id: userId,
          daily_rate: dailyRate,
          start_mileage: startMileage || null,
          start_fuel_level: startFuelLevel || null,
          replacement_reason: replacementReason,
        })
        .select("id")
        .single();
      if (errNewVehicle) throw errNewVehicle;
      const replacementId = newVehicleRow?.id;
      if (!replacementId) throw new Error("Replacement saved, but the replacement event ID was not returned.");

      const { data: updatedVehiclePeriods, error: updatedVehiclePeriodsError } = await extendedDb
        .from("contract_vehicles")
        .select("id, started_at, ended_at, daily_rate, replacement_reason")
        .eq("contract_id", contractId);
      if (updatedVehiclePeriodsError) throw updatedVehiclePeriodsError;

      const recalculatedAmount = calculateRentalPeriodAmount(
        (updatedVehiclePeriods ?? []) as VehicleRatePeriod[],
        activeRentalTarget.periodStart,
        activeRentalTarget.periodEnd,
      );

      if (activeRentalTarget.type === "contract") {
        const { error: errRentalAmount } = await extendedDb
          .from("contracts")
          .update({ total_amount: recalculatedAmount })
          .eq("id", contractId);
        if (errRentalAmount) throw errRentalAmount;
      } else {
        const { error: errRentalFeeAmount } = await (extendedDb as any)
          .from("contract_fees")
          .update({ amount: recalculatedAmount })
          .eq("id", activeRentalTarget.id);
        if (errRentalFeeAmount) throw errRentalFeeAmount;
      }

      const replacementRows = ((updatedVehiclePeriods ?? []) as Array<{
        id: string;
        started_at: string;
        replacement_reason: string | null;
      }>)
        .filter((row) => row.replacement_reason)
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
      const replacementNo = Math.max(1, replacementRows.findIndex((row) => row.id === replacementId) + 1);

      const [{ data: contractContact }, { data: profileData }] = await Promise.all([
        (supabase as any)
          .from("contracts")
          .select("clients(phone)")
          .eq("id", contractId)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("company_name, phone_number, email")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      const profile = (profileData ?? {}) as {
        company_name?: string | null;
        phone_number?: string | null;
        email?: string | null;
      };
      const clientPhone = (contractContact as { clients?: { phone?: string | null } | null } | null)?.clients?.phone ?? null;

      setReplacementAddendumData({
        contractId,
        replacementId,
        replacementNo,
        replacementType,
        reason: replacementReason,
        replacementDateTime: formatAddendumDateTime(replacementTime),
        ownerId: userId,
        createdBy: userId,
        clientPhone,
        company: {
          name: profile.company_name || "Rental Company",
          phone: profile.phone_number || "",
          email: profile.email || user.email || "",
        },
        oldVehicle: {
          plate: currentCar?.plate ?? "",
          make: currentCar?.make ?? "",
          model: currentCar?.model ?? "",
          mileage: endMileage || null,
          fuel: formatFuelLevelLabel(endFuelLevel),
          notes: conditionNote || null,
        },
        newVehicle: {
          plate: selectedNewCar?.plate ?? "",
          make: selectedNewCar?.make ?? "",
          model: selectedNewCar?.model ?? "",
          mileage: startMileage || null,
          fuel: formatFuelLevelLabel(startFuelLevel),
          notes: "Replacement handover inspection photos completed.",
        },
        customerSignature: "",
        companySignature: "",
      });

      toast({
        title: "Vehicle Replaced",
        description: "Vehicle replacement recorded successfully. Add inspection photos next.",
      });

      onSuccess();
      setReplacementInspectionId(replacementId);
      setReplacementInspectionUploadedBy(userId);
      setReplacementInspectionOpen(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
      console.error("Replacement transaction failed:", err);
      toast({
        title: "Replacement Failed",
        description: `Failed to replace vehicle: ${message}`,
        variant: "destructive",
      });
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleReplacementAddendumSigned = async (signatures: ReplacementAddendumSignatures) => {
    if (!replacementAddendumData) {
      throw new Error("Replacement addendum details are not loaded.");
    }

    let signedAddendum: ReplacementAddendumPreviewData;
    let blob: Blob;
    let storagePath = "";
    let publicUrl = "";

    try {
      signedAddendum = {
        ...replacementAddendumData,
        customerSignature: signatures.customerSignature,
        companySignature: signatures.companySignature,
      };
      blob = (await generateReplacementAddendumPdf(signedAddendum, { returnBlob: true })) as Blob;
      if (!(blob instanceof Blob)) {
        throw new Error("PDF generator did not return a Blob.");
      }
    } catch (error) {
      console.error("Replacement addendum PDF generation failed", error);
      throw new Error(`PDF generation failed: ${getReplacementAddendumErrorMessage(error)}`);
    }

    try {
      storagePath = `${contractId}/replacement-addendum-${replacementAddendumData.replacementId}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("contract-pdfs")
        .upload(storagePath, blob, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) throw uploadError;
    } catch (error) {
      console.error("Replacement addendum PDF upload failed", error);
      throw new Error(`PDF upload failed: ${getReplacementAddendumErrorMessage(error)}`);
    }

    try {
      const { data: publicData } = supabase.storage
        .from("contract-pdfs")
        .getPublicUrl(storagePath);
      publicUrl = publicData?.publicUrl ?? "";
      if (!publicUrl) {
        throw new Error("Supabase did not return a public URL.");
      }
    } catch (error) {
      console.error("Replacement addendum public URL generation failed", error);
      throw new Error(`Public URL generation failed: ${getReplacementAddendumErrorMessage(error)}`);
    }

    const documentPayload = {
      contract_id: contractId,
      owner_id: replacementAddendumData.ownerId,
      document_type: "vehicle_replacement_addendum",
      title: `Replacement Addendum #${replacementAddendumData.replacementNo}`,
      storage_bucket: "contract-pdfs",
      storage_path: storagePath,
      public_url: publicUrl,
      created_by: replacementAddendumData.createdBy,
    };

    try {
      const { data: existingDocuments, error: existingError } = await (supabase as any)
        .from("contract_documents")
        .select("id")
        .eq("contract_id", contractId)
        .eq("storage_bucket", "contract-pdfs")
        .eq("storage_path", storagePath);
      if (existingError) throw existingError;

      const saveDocument = async (payload: Record<string, unknown>) => {
        if ((existingDocuments ?? []).length > 0) {
          return (supabase as any)
            .from("contract_documents")
            .update(payload)
            .eq("contract_id", contractId)
            .eq("storage_bucket", "contract-pdfs")
            .eq("storage_path", storagePath);
        }

        return (supabase as any)
          .from("contract_documents")
          .insert(payload);
      };

      let documentResult = await saveDocument(documentPayload);
      if (documentResult.error && /created_by/i.test(documentResult.error.message ?? "")) {
        const { created_by, ...payloadWithoutCreatedBy } = documentPayload;
        documentResult = await saveDocument(payloadWithoutCreatedBy);
      }
      if (documentResult.error) throw documentResult.error;
    } catch (error) {
      console.error("Replacement addendum document registration failed", error);
      throw new Error(`Document registration failed: ${getReplacementAddendumErrorMessage(error)}`);
    }

    setReplacementAddendumData(signedAddendum);
    onSuccess();
    toast({
      title: "Replacement Addendum signed successfully",
      description: "Signed PDF uploaded and saved in Documents.",
    });

    return publicUrl;
  };

  const finishReplacementAddendumFlow = () => {
    setReplacementSignatureOpen(false);
    setReplacementInspectionId("");
    setReplacementInspectionUploadedBy(null);
    setReplacementAddendumData(null);
    onClose();
  };

  if (isPage) {
    return (
      <>
        <div className="min-h-screen bg-[#0F1117] pb-8 text-white font-dm-sans">
          <header className="border-b border-white/10 bg-[#0F1117] px-4 py-4 md:px-8">
            <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Button
                  type="button"
                  variant="ghost"
                  className="mb-2 min-h-10 px-0 text-white/60 hover:bg-transparent hover:text-white"
                  onClick={onClose}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  Back to contract
                </Button>
                <h1 className="truncate text-xl font-semibold tracking-tight text-white">Replace Vehicle</h1>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/55">
                  <span className="font-ibm-plex-mono">Contract {contractSummary?.contractNumber || contractId.slice(0, 8).toUpperCase()}</span>
                  {contractSummary?.clientName && <span>{contractSummary.clientName}</span>}
                  {contractSummary?.currentVehicle && <span>{contractSummary.currentVehicle}</span>}
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-4xl px-4 py-5 md:px-8">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white/90">Replacement Details</h3>
                <span className="font-ibm-plex-mono text-xs text-white/50">
                  Contract {contractId.slice(0, 8).toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="replacement-time-page" className="text-xs text-white/50 uppercase tracking-wider">
                    Replacement Date & Time
                  </Label>
                  <Input
                    id="replacement-time-page"
                    type="datetime-local"
                    value={replacementTime}
                    onChange={(e) => setReplacementTime(e.target.value)}
                    className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">
                    Replacement Type
                  </Label>
                  <Select value={replacementType} onValueChange={setReplacementType}>
                    <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111111] border-white/10 text-white">
                      <SelectItem value="Temporary" className="focus:bg-[#1a1a1a] focus:text-white">Temporary</SelectItem>
                      <SelectItem value="Permanent" className="focus:bg-[#1a1a1a] focus:text-white">Permanent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">
                    Reason for Replacement
                  </Label>
                  <Select value={replacementReason} onValueChange={handleReplacementReasonChange}>
                    <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111111] border-white/10 text-white">
                      <SelectItem value="Breakdown" className="focus:bg-[#1a1a1a] focus:text-white">Breakdown</SelectItem>
                      <SelectItem value="Accident" className="focus:bg-[#1a1a1a] focus:text-white">Accident</SelectItem>
                      <SelectItem value="Customer request" className="focus:bg-[#1a1a1a] focus:text-white">Customer Request</SelectItem>
                      <SelectItem value="Upgrade" className="focus:bg-[#1a1a1a] focus:text-white">Upgrade</SelectItem>
                      <SelectItem value="Company decision" className="focus:bg-[#1a1a1a] focus:text-white">Company Decision</SelectItem>
                      <SelectItem value="Other" className="focus:bg-[#1a1a1a] focus:text-white">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4 border-t border-b border-white/10 py-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white/90 border-b border-white/5 pb-2">
                  Current Vehicle Return
                </h3>

                <div className="space-y-2">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">
                    Current Vehicle
                  </Label>
                  <div className="font-ibm-plex-mono bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-2 text-sm text-white/70">
                    {loadingCurrentCar ? (
                      <span className="text-xs text-white/40 italic">Loading vehicle info...</span>
                    ) : currentCar ? (
                      `${currentCar.plate} — ${currentCar.make} ${currentCar.model} (${currentCar.year})`
                    ) : (
                      currentCarId.slice(0, 8).toUpperCase()
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-mileage-page" className="text-xs text-white/50 uppercase tracking-wider">
                    End Mileage
                  </Label>
                  <Input
                    id="end-mileage-page"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={endMileage}
                    onChange={(e) => setEndMileage(e.target.value)}
                    className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">
                    Fuel Level
                  </Label>
                  <Select value={endFuelLevel} onValueChange={setEndFuelLevel}>
                    <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                      <SelectValue placeholder="Select fuel level" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111111] border-white/10 text-white">
                      <SelectItem value="0" className="focus:bg-[#1a1a1a] focus:text-white">Empty</SelectItem>
                      <SelectItem value="25" className="focus:bg-[#1a1a1a] focus:text-white">1/4</SelectItem>
                      <SelectItem value="50" className="focus:bg-[#1a1a1a] focus:text-white">1/2</SelectItem>
                      <SelectItem value="75" className="focus:bg-[#1a1a1a] focus:text-white">3/4</SelectItem>
                      <SelectItem value="100" className="focus:bg-[#1a1a1a] focus:text-white">Full</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="condition-note-page" className="text-xs text-white/50 uppercase tracking-wider">
                    Condition Note
                  </Label>
                  <Textarea
                    id="condition-note-page"
                    value={conditionNote}
                    onChange={(e) => setConditionNote(e.target.value)}
                    placeholder="e.g. minor scratch on rear bumper"
                    className="min-h-20 bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">
                    Send Vehicle To
                  </Label>
                  <Select value={sentToStatus} onValueChange={setSentToStatus}>
                    <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111111] border-white/10 text-white">
                      <SelectItem value="Available" className="focus:bg-[#1a1a1a] focus:text-white">Available</SelectItem>
                      <SelectItem value="Service" className="focus:bg-[#1a1a1a] focus:text-white">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white/90 border-b border-white/5 pb-2">
                  Replacement Vehicle Handover
                </h3>

                <div className="space-y-2">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">
                    Available Vehicles
                  </Label>
                  {loadingCars ? (
                    <div className="text-xs text-white/60 italic py-2">Loading available fleet...</div>
                  ) : availableCars.length === 0 ? (
                    <div className="text-xs text-destructive italic py-2">No available cars found in fleet.</div>
                  ) : (
                    <Popover open={newVehicleComboboxOpen} onOpenChange={setNewVehicleComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={newVehicleComboboxOpen}
                          className="h-10 w-full justify-between bg-[#1a1a1a] border-white/10 text-white hover:bg-[#1a1a1a] hover:text-white focus:ring-0 focus:ring-offset-0"
                        >
                          {selectedNewCar ? (
                            <span className="truncate text-left">
                              <span className="font-ibm-plex-mono mr-2">{selectedNewCar.plate}</span> —{" "}
                              {selectedNewCar.make} {selectedNewCar.model} ({selectedNewCar.year})
                            </span>
                          ) : (
                            <span className="text-white/50">Select new vehicle</span>
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0 bg-[#111111] border-white/10 text-white"
                        align="start"
                      >
                        <Command shouldFilter={false} className="bg-[#111111] text-white">
                          <CommandInput
                            placeholder="Select new vehicle"
                            value={newVehicleSearch}
                            onValueChange={setNewVehicleSearch}
                            className="text-white placeholder:text-white/25"
                          />
                          <CommandList className="max-h-56">
                            <CommandEmpty>No available cars found in fleet.</CommandEmpty>
                            <CommandGroup>
                              {filteredAvailableCars.map((car) => (
                                <CommandItem
                                  key={car.id}
                                  value={`${car.plate} ${car.make} ${car.model}`}
                                  onSelect={() => {
                                    setSelectedNewCarId(car.id);
                                    setNewVehicleComboboxOpen(false);
                                    setNewVehicleSearch("");
                                  }}
                                  className="focus:bg-[#1a1a1a] focus:text-white"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedNewCarId === car.id ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  <span className="truncate">
                                    <span className="font-ibm-plex-mono mr-2">{car.plate}</span> — {car.make} {car.model} ({car.year})
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start-mileage-page" className="text-xs text-white/50 uppercase tracking-wider">
                    Start Mileage
                  </Label>
                  <Input
                    id="start-mileage-page"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={startMileage}
                    onChange={(e) => setStartMileage(e.target.value)}
                    className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">
                    Fuel Level
                  </Label>
                  <Select value={startFuelLevel} onValueChange={setStartFuelLevel}>
                    <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                      <SelectValue placeholder="Select fuel level" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111111] border-white/10 text-white">
                      <SelectItem value="0" className="focus:bg-[#1a1a1a] focus:text-white">Empty</SelectItem>
                      <SelectItem value="25" className="focus:bg-[#1a1a1a] focus:text-white">1/4</SelectItem>
                      <SelectItem value="50" className="focus:bg-[#1a1a1a] focus:text-white">1/2</SelectItem>
                      <SelectItem value="75" className="focus:bg-[#1a1a1a] focus:text-white">3/4</SelectItem>
                      <SelectItem value="100" className="focus:bg-[#1a1a1a] focus:text-white">Full</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 rounded-md border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="current-monthly-price-page" className="text-xs text-white/50 uppercase tracking-wider">
                  Current Vehicle Monthly Price
                </Label>
                <Input
                  id="current-monthly-price-page"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="decimal"
                  value={currentMonthlyPrice}
                  onChange={(e) => setCurrentMonthlyPrice(e.target.value)}
                  placeholder="AED per month"
                  className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                />
                <div className="text-[11px] text-white/45 font-ibm-plex-mono">
                  Daily rate: {currentPreviewDailyRate > 0 ? `AED ${formatAed(currentPreviewDailyRate)}` : "AED --"}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="replacement-monthly-price-page" className="text-xs text-white/50 uppercase tracking-wider">
                  Replacement Vehicle Monthly Price
                </Label>
                <Input
                  id="replacement-monthly-price-page"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="decimal"
                  value={monthlyPrice}
                  onChange={(e) => setMonthlyPrice(e.target.value)}
                  placeholder="AED per month"
                  className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                />
                <div className="text-[11px] text-white/45 font-ibm-plex-mono">
                  Daily rate: {previewDailyRate > 0 ? `AED ${formatAed(previewDailyRate)}` : "AED --"}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                <Calculator className="h-4 w-4 text-blue-300" aria-hidden="true" />
                Swap cost calculator
              </div>

              {loadingRentalPeriods ? (
                <div className="text-sm text-white/55">Loading rental periods...</div>
              ) : swapCostPreview ? (
                <div className="space-y-2 text-sm text-white/75">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Car #1</span>
                    <span className="font-ibm-plex-mono text-white">
                      {swapCostPreview.oldCarDays} days × AED {formatAed(swapCostPreview.oldCarDailyRate)} = AED{" "}
                      {formatAed(swapCostPreview.oldCarTotal)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Car #2</span>
                    <span className="font-ibm-plex-mono text-white">
                      {swapCostPreview.newCarDays} days × AED {formatAed(swapCostPreview.newCarDailyRate)} = AED{" "}
                      {formatAed(swapCostPreview.newCarTotal)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-white">
                    <span className="font-medium">Period total</span>
                    <span className="font-ibm-plex-mono">
                      AED {formatAed(swapCostPreview.oldCarTotal)} + AED {formatAed(swapCostPreview.newCarTotal)} = AED{" "}
                      {formatAed(swapCostPreview.total)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-amber-200/80">Swap date does not fall within any rental period.</div>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={onClose} className="min-h-11 text-white/60 hover:text-white hover:bg-white/5">
                Cancel
              </Button>
              <Button
                disabled={!selectedNewCarId || !replacementReason || previewDailyRate <= 0 || confirmLoading}
                onClick={handleConfirm}
                className="min-h-11 bg-[#4f6ef7] hover:bg-[#4f6ef7]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmLoading ? "Replacing..." : "Confirm Replacement"}
              </Button>
            </div>
          </main>
        </div>
        <ReplacementInspectionModal
          contractId={contractId}
          replacementId={replacementInspectionId}
          uploadedBy={replacementInspectionUploadedBy}
          open={replacementInspectionOpen}
          onCancel={() => {
            setReplacementInspectionOpen(false);
            setReplacementInspectionId("");
            setReplacementInspectionUploadedBy(null);
            onClose();
          }}
          onComplete={() => {
            setReplacementInspectionOpen(false);
            setReplacementSignatureOpen(true);
          }}
        />
        <ReplacementAddendumSignatureModal
          open={replacementSignatureOpen}
          addendum={replacementAddendumData}
          onCancel={() => {
            setReplacementSignatureOpen(false);
            setReplacementInspectionId("");
            setReplacementInspectionUploadedBy(null);
            setReplacementAddendumData(null);
            onClose();
          }}
          onSigned={handleReplacementAddendumSigned}
          onFinished={finishReplacementAddendumFlow}
        />
      </>
    );
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[95dvh] max-w-2xl flex-col overflow-hidden bg-[#0F1117] border-white/10 text-white p-6 rounded-lg shadow-xl font-dm-sans">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl font-semibold tracking-tight text-white">
            Vehicle Replacement
          </DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            Close current vehicle and hand over a replacement under the same contract.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="my-4 rounded-md border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white/90">Replacement Details</h3>
              <span className="font-ibm-plex-mono text-xs text-white/50">
                Contract {contractId.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="replacement-time" className="text-xs text-white/50 uppercase tracking-wider">
                  Replacement Date & Time
                </Label>
                <Input
                  id="replacement-time"
                  type="datetime-local"
                  value={replacementTime}
                  onChange={(e) => setReplacementTime(e.target.value)}
                  className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-white/50 uppercase tracking-wider">
                  Replacement Type
                </Label>
                <Select value={replacementType} onValueChange={setReplacementType}>
                  <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-white/10 text-white">
                    <SelectItem value="Temporary" className="focus:bg-[#1a1a1a] focus:text-white">Temporary</SelectItem>
                    <SelectItem value="Permanent" className="focus:bg-[#1a1a1a] focus:text-white">Permanent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-white/50 uppercase tracking-wider">
                  Reason for Replacement
                </Label>
                <Select value={replacementReason} onValueChange={handleReplacementReasonChange}>
                  <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-white/10 text-white">
                    <SelectItem value="Breakdown" className="focus:bg-[#1a1a1a] focus:text-white">Breakdown</SelectItem>
                    <SelectItem value="Accident" className="focus:bg-[#1a1a1a] focus:text-white">Accident</SelectItem>
                    <SelectItem value="Customer request" className="focus:bg-[#1a1a1a] focus:text-white">Customer Request</SelectItem>
                    <SelectItem value="Upgrade" className="focus:bg-[#1a1a1a] focus:text-white">Upgrade</SelectItem>
                    <SelectItem value="Company decision" className="focus:bg-[#1a1a1a] focus:text-white">Company Decision</SelectItem>
                    <SelectItem value="Other" className="focus:bg-[#1a1a1a] focus:text-white">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4 border-t border-b border-white/10 py-6">
          {/* Section 1 — Current Vehicle End */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white/90 border-b border-white/5 pb-2">
              Current Vehicle Return
            </h3>
            
            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Current Vehicle
              </Label>
              <div className="font-ibm-plex-mono bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-2 text-sm text-white/70">
                {loadingCurrentCar ? (
                  <span className="text-xs text-white/40 italic">Loading vehicle info...</span>
                ) : currentCar ? (
                  `${currentCar.plate} — ${currentCar.make} ${currentCar.model} (${currentCar.year})`
                ) : (
                  currentCarId.slice(0, 8).toUpperCase()
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-mileage" className="text-xs text-white/50 uppercase tracking-wider">
                End Mileage
              </Label>
              <Input
                id="end-mileage"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={endMileage}
                onChange={(e) => setEndMileage(e.target.value)}
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Fuel Level
              </Label>
              <Select value={endFuelLevel} onValueChange={setEndFuelLevel}>
                <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                  <SelectValue placeholder="Select fuel level" />
                </SelectTrigger>
                <SelectContent className="bg-[#111111] border-white/10 text-white">
                  <SelectItem value="0" className="focus:bg-[#1a1a1a] focus:text-white">Empty</SelectItem>
                  <SelectItem value="25" className="focus:bg-[#1a1a1a] focus:text-white">1/4</SelectItem>
                  <SelectItem value="50" className="focus:bg-[#1a1a1a] focus:text-white">1/2</SelectItem>
                  <SelectItem value="75" className="focus:bg-[#1a1a1a] focus:text-white">3/4</SelectItem>
                  <SelectItem value="100" className="focus:bg-[#1a1a1a] focus:text-white">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition-note" className="text-xs text-white/50 uppercase tracking-wider">
                Condition Note
              </Label>
              <Textarea
                id="condition-note"
                value={conditionNote}
                onChange={(e) => setConditionNote(e.target.value)}
                placeholder="e.g. minor scratch on rear bumper"
                className="min-h-20 bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Send Vehicle To
              </Label>
              <Select value={sentToStatus} onValueChange={setSentToStatus}>
                <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111111] border-white/10 text-white">
                  <SelectItem value="Available" className="focus:bg-[#1a1a1a] focus:text-white">Available</SelectItem>
                  <SelectItem value="Service" className="focus:bg-[#1a1a1a] focus:text-white">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Section 2 — New Vehicle */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white/90 border-b border-white/5 pb-2">
              Replacement Vehicle Handover
            </h3>

            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Available Vehicles
              </Label>
              {loadingCars ? (
                <div className="text-xs text-white/60 italic py-2">Loading available fleet...</div>
              ) : availableCars.length === 0 ? (
                <div className="text-xs text-destructive italic py-2">No available cars found in fleet.</div>
              ) : (
                <Popover open={newVehicleComboboxOpen} onOpenChange={setNewVehicleComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={newVehicleComboboxOpen}
                      className="h-10 w-full justify-between bg-[#1a1a1a] border-white/10 text-white hover:bg-[#1a1a1a] hover:text-white focus:ring-0 focus:ring-offset-0"
                    >
                      {selectedNewCar ? (
                        <span className="truncate text-left">
                          <span className="font-ibm-plex-mono mr-2">{selectedNewCar.plate}</span> —{" "}
                          {selectedNewCar.make} {selectedNewCar.model} ({selectedNewCar.year})
                        </span>
                      ) : (
                        <span className="text-white/50">Select new vehicle</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0 bg-[#111111] border-white/10 text-white"
                    align="start"
                  >
                    <Command shouldFilter={false} className="bg-[#111111] text-white">
                      <CommandInput
                        placeholder="Select new vehicle"
                        value={newVehicleSearch}
                        onValueChange={setNewVehicleSearch}
                        className="text-white placeholder:text-white/25"
                      />
                      <CommandList className="max-h-56">
                        <CommandEmpty>No available cars found in fleet.</CommandEmpty>
                        <CommandGroup>
                          {filteredAvailableCars.map((car) => (
                            <CommandItem
                              key={car.id}
                              value={`${car.plate} ${car.make} ${car.model}`}
                              onSelect={() => {
                                setSelectedNewCarId(car.id);
                                setNewVehicleComboboxOpen(false);
                                setNewVehicleSearch("");
                              }}
                              className="focus:bg-[#1a1a1a] focus:text-white"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedNewCarId === car.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span className="truncate">
                                <span className="font-ibm-plex-mono mr-2">{car.plate}</span> — {car.make} {car.model} ({car.year})
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-mileage" className="text-xs text-white/50 uppercase tracking-wider">
                Start Mileage
              </Label>
              <Input
                id="start-mileage"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={startMileage}
                onChange={(e) => setStartMileage(e.target.value)}
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Fuel Level
              </Label>
              <Select value={startFuelLevel} onValueChange={setStartFuelLevel}>
                <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                  <SelectValue placeholder="Select fuel level" />
                </SelectTrigger>
                <SelectContent className="bg-[#111111] border-white/10 text-white">
                  <SelectItem value="0" className="focus:bg-[#1a1a1a] focus:text-white">Empty</SelectItem>
                  <SelectItem value="25" className="focus:bg-[#1a1a1a] focus:text-white">1/4</SelectItem>
                  <SelectItem value="50" className="focus:bg-[#1a1a1a] focus:text-white">1/2</SelectItem>
                  <SelectItem value="75" className="focus:bg-[#1a1a1a] focus:text-white">3/4</SelectItem>
                  <SelectItem value="100" className="focus:bg-[#1a1a1a] focus:text-white">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 rounded-md border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current-monthly-price" className="text-xs text-white/50 uppercase tracking-wider">
                Current Vehicle Monthly Price
              </Label>
              <Input
                id="current-monthly-price"
                type="number"
                min="1"
                step="1"
                inputMode="decimal"
                value={currentMonthlyPrice}
                onChange={(e) => setCurrentMonthlyPrice(e.target.value)}
                placeholder="AED per month"
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
              <div className="text-[11px] text-white/45 font-ibm-plex-mono">
                Daily rate: {currentPreviewDailyRate > 0 ? `AED ${formatAed(currentPreviewDailyRate)}` : "AED --"}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="replacement-monthly-price" className="text-xs text-white/50 uppercase tracking-wider">
                Replacement Vehicle Monthly Price
              </Label>
              <Input
                id="replacement-monthly-price"
                type="number"
                min="1"
                step="1"
                inputMode="decimal"
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                placeholder="AED per month"
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
              <div className="text-[11px] text-white/45 font-ibm-plex-mono">
                Daily rate: {previewDailyRate > 0 ? `AED ${formatAed(previewDailyRate)}` : "AED --"}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <Calculator className="h-4 w-4 text-blue-300" aria-hidden="true" />
              Swap cost calculator
            </div>

            {loadingRentalPeriods ? (
              <div className="text-sm text-white/55">Loading rental periods...</div>
            ) : swapCostPreview ? (
              <div className="space-y-2 text-sm text-white/75">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Car #1</span>
                  <span className="font-ibm-plex-mono text-white">
                    {swapCostPreview.oldCarDays} days × AED {formatAed(swapCostPreview.oldCarDailyRate)} = AED{" "}
                    {formatAed(swapCostPreview.oldCarTotal)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Car #2</span>
                  <span className="font-ibm-plex-mono text-white">
                    {swapCostPreview.newCarDays} days × AED {formatAed(swapCostPreview.newCarDailyRate)} = AED{" "}
                    {formatAed(swapCostPreview.newCarTotal)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-white">
                  <span className="font-medium">Period total</span>
                  <span className="font-ibm-plex-mono">
                    AED {formatAed(swapCostPreview.oldCarTotal)} + AED {formatAed(swapCostPreview.newCarTotal)} = AED{" "}
                    {formatAed(swapCostPreview.total)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-amber-200/80">Swap date does not fall within any rental period.</div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </Button>
          <Button
            disabled={!selectedNewCarId || !replacementReason || previewDailyRate <= 0 || confirmLoading}
            onClick={handleConfirm}
            className="bg-[#4f6ef7] hover:bg-[#4f6ef7]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLoading ? "Replacing..." : "Confirm Replacement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ReplacementInspectionModal
      contractId={contractId}
      replacementId={replacementInspectionId}
      uploadedBy={replacementInspectionUploadedBy}
      open={replacementInspectionOpen}
      onCancel={() => {
        setReplacementInspectionOpen(false);
        setReplacementInspectionId("");
        setReplacementInspectionUploadedBy(null);
        onClose();
      }}
      onComplete={() => {
        setReplacementInspectionOpen(false);
        setReplacementSignatureOpen(true);
      }}
    />
    <ReplacementAddendumSignatureModal
      open={replacementSignatureOpen}
      addendum={replacementAddendumData}
      onCancel={() => {
        setReplacementSignatureOpen(false);
        setReplacementInspectionId("");
        setReplacementInspectionUploadedBy(null);
        setReplacementAddendumData(null);
        onClose();
      }}
      onSigned={handleReplacementAddendumSigned}
      onFinished={finishReplacementAddendumFlow}
    />
    </>
  );
};
