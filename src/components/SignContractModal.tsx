import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, MessageCircle } from "lucide-react";
import QRCode from "qrcode";
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
  },
);

type ContractForPdf = Parameters<typeof generateContractPdf>[0];
type PreviewContract = ContractForPdf & Record<string, unknown>;

interface CompanyProfile {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  termsEn: string;
  logoUrl: string | null;
}

interface ContractSummary {
  clientName: string;
  pdfData: ContractForPdf;
  previewData: PreviewContract;
  profile: CompanyProfile;
}

interface SignContractModalProps {
  contractId: string;
  clientName: string;
  open: boolean;
  onComplete: () => void;
}

const colors = {
  blue: "#005ab3",
  blueSoft: "#f0f7ff",
  ink: "#0f172a",
  muted: "#566478",
  line: "#d6e0eb",
  panel: "#f9fbfd",
};

function fmtDate(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(date: string, time?: string | null): string {
  const formattedDate = fmtDate(date);
  if (!time) return formattedDate;
  const [hours, minutes] = time.split(":");
  if (!hours || !minutes) return formattedDate;
  return `${formattedDate} ${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function valueOrDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function unknownString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function firstValue(...values: unknown[]): string {
  const value = values.find((v) => v !== null && v !== undefined && String(v).trim() !== "");
  return value === null || value === undefined ? "" : String(value);
}

function money(value: number): string {
  return `AED ${Number(value || 0).toLocaleString()}`;
}

function km(value: number): string {
  return `${Number(value || 0).toLocaleString()} km`;
}

function getTermsBullets(termsEn: string): string[] {
  const termsText = termsEn.trim() ||
    "The renter agrees to return the vehicle in the same condition as received.\n\nAny traffic fines, Salik charges, or damages incurred during the rental period are the responsibility of the renter.\n\nThe deposit will be refunded after inspection upon vehicle return.";

  return termsText
    .split(/\n{2,}/)
    .flatMap((chunk) => chunk.split(/(?=\(\d+\))/))
    .map((bullet) => bullet.replace(/\n/g, " ").trim())
    .map((bullet) => {
      const mentionsDeposit = /deposit|security/i.test(bullet);
      const mentionsFixedDeposit = /AED\s*2,?000|2,?000\s*AED|fixed\s+deposit/i.test(bullet);
      return mentionsDeposit && mentionsFixedDeposit
        ? "The Company may retain a security deposit when applicable, as stated in the Financial Summary."
        : bullet;
    })
    .filter(Boolean)
    .map((bullet) => bullet.replace(/^(\(?\d+\)?[.)]?)\s*/, ""));
}

function SectionTitle({ num, title }: { num: number; title: string }) {
  return (
    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-normal text-[#005ab3]">
      {num}.&nbsp;&nbsp;{title}
    </h3>
  );
}

function IconBadge() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-[#cde0f5] bg-[#f0f7ff]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#005ab3]" />
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 border-b border-[#d6e0eb] py-2 last:border-b-0">
      <IconBadge />
      <div className="min-w-0">
        <div className="text-[8px] text-[#566478]">{label}</div>
        <div className={cn("break-words text-[10px] font-bold text-[#0f172a]", /\d|AED/.test(value) && "font-mono")}>
          {valueOrDash(value)}
        </div>
      </div>
    </div>
  );
}

function ListCard({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded border border-[#d6e0eb] bg-white px-3 py-1">
      {rows.map(([label, value]) => (
        <DetailRow key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function FieldCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[42px] gap-2 rounded border border-[#d6e0eb] bg-white p-2">
      <IconBadge />
      <div className="min-w-0">
        <div className="text-[8px] text-[#566478]">{label}</div>
        <div className={cn("break-words text-[10px] font-bold text-[#0f172a]", /\d|AED/.test(value) && "font-mono")}>
          {valueOrDash(value)}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded border bg-white p-2", accent ? "border-[#005ab3] bg-[#f4f8fc]" : "border-[#d6e0eb]")}>
      <div className={cn("text-[8px] font-bold", accent ? "text-[#005ab3]" : "text-[#566478]")}>{label}</div>
      <div className={cn("mt-2 break-words text-[11px] font-bold text-[#0f172a]", /\d|AED/.test(value) && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

function ContractPage({
  pageNo,
  children,
}: {
  pageNo: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mx-auto flex w-full max-w-[794px] flex-col bg-white p-4 text-[#0f172a] shadow-sm ring-1 ring-[#d6e0eb] sm:p-8"
      style={{ minHeight: "1123px" }}
    >
      <div className="flex-1 border border-[#d6e0eb] p-4 sm:p-6">
        {children}
      </div>
      <div className="mt-4 border-t border-[#005ab3] pt-2 text-right text-[9px] text-[#566478]">
        Page {pageNo} of 3
      </div>
    </section>
  );
}

function SignatureBox({
  title,
  signer,
  canvasRef,
  onStroke,
  onClear,
}: {
  title: string;
  signer: string;
  canvasRef: React.Ref<SigRef>;
  onStroke: () => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded border border-[#d6e0eb] bg-white p-3">
      <div className="text-center text-[10px] font-bold uppercase text-[#005ab3]">{title}</div>
      <div className="mt-3 rounded-sm border border-[#d6e0eb]">
        <SignatureCanvas ref={canvasRef} onStroke={onStroke} />
      </div>
      <div className="mt-2 h-px bg-[#d6e0eb]" />
      <div className="mt-2 text-[10px] font-bold text-[#0f172a]">{valueOrDash(signer)}</div>
      <div className="mt-1 text-[9px] text-[#0f172a]">Date: {fmtDate(new Date().toISOString())}</div>
      <Button type="button" variant="outline" size="sm" className="mt-3 min-h-10 w-full text-xs" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

function ContractHtmlPreview({
  summary,
  clientSigRef,
  managerSigRef,
  onClientStroke,
  onManagerStroke,
  onClientClear,
  onManagerClear,
}: {
  summary: ContractSummary;
  clientSigRef: React.Ref<SigRef>;
  managerSigRef: React.Ref<SigRef>;
  onClientStroke: () => void;
  onManagerStroke: () => void;
  onClientClear: () => void;
  onManagerClear: () => void;
}) {
  const contract = summary.previewData;
  const c = contract.clients;
  const car = contract.cars;
  const company = summary.profile;
  const [inspectionQr, setInspectionQr] = useState("");
  const contractNumber = `CTR-${contract.id.slice(0, 8).toUpperCase()}`;
  const today = fmtDate(new Date().toISOString());
  const idLabel = c?.client_type === "Tourist" ? "Passport Number" : "Emirates ID";
  const idValue = c?.client_type === "Tourist" ? valueOrDash(c?.passport_number) : valueOrDash(c?.emirates_id);
  const clientRecord = (c ?? {}) as Record<string, unknown>;
  const carRecord = (car ?? {}) as Record<string, unknown>;
  const licenseNumber = firstValue(
    c?.license_number,
    c?.driver_license_number,
    c?.driving_license_number,
    c?.licenseNo,
    c?.drivingLicenseNo,
    c?.drivers_license,
    c?.license,
    c?.driving_license,
    c?.client_license_number,
    c?.driverLicenseNumber,
    clientRecord.license_number,
    clientRecord.driver_license_number,
    clientRecord.driving_license_number,
    clientRecord.licenseNo,
    clientRecord.drivingLicenseNo,
    clientRecord.drivers_license,
    clientRecord.license,
    clientRecord.driving_license,
    clientRecord.client_license_number,
    clientRecord.driverLicenseNumber,
    contract.license_number,
    contract.driver_license_number,
    contract.driving_license_number,
    contract.licenseNo,
    contract.drivingLicenseNo,
    contract.drivers_license,
    contract.license,
    contract.driving_license,
    contract.client_license_number,
    contract.driverLicenseNumber,
  );
  const vehicleColor = firstValue(
    car?.color,
    car?.vehicle_color,
    car?.car_color,
    car?.colour,
    carRecord.color,
    carRecord.vehicle_color,
    carRecord.car_color,
    carRecord.colour,
    contract.color,
    contract.vehicle_color,
    contract.car_color,
    contract.colour,
  );
  const exteriorCondition = firstValue(
    contract.exterior_condition,
    contract.exteriorCondition,
    contract.special_conditions,
  );
  const interiorCondition = firstValue(
    contract.interior_condition,
    contract.interiorCondition,
  );

  const termsBullets = useMemo(() => getTermsBullets(company.termsEn), [company.termsEn]);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(`https://uae-drive-suite.vercel.app/inspection/${contract.id}`, { width: 120 })
      .then((dataUrl) => {
        if (!cancelled) setInspectionQr(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setInspectionQr("");
      });
    return () => {
      cancelled = true;
    };
  }, [contract.id]);

  const vehicleRows: [string, string][] = [
    ["Plate Number", valueOrDash(car?.plate)],
    ["Make & Model", car ? `${car.make} ${car.model}` : "-"],
    ["Year", car ? String(car.year) : "-"],
    ["Color", valueOrDash(vehicleColor)],
  ];

  const conditionRows: [string, string][] = [
    ["Initial Mileage", km(contract.initial_mileage)],
    ["Fuel Level", valueOrDash(contract.fuel_level)],
  ];
  if (exteriorCondition) conditionRows.push(["Exterior Condition", exteriorCondition]);
  if (interiorCondition) conditionRows.push(["Interior Condition", interiorCondition]);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ContractPage pageNo={1}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt="" className="h-8 max-w-10 object-contain" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0f7ff] text-sm font-bold text-[#005ab3]">
                {company.companyName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-[16px] font-bold">{company.companyName}</div>
              <div className="text-[10px] text-[#005ab3]">Car Rental</div>
            </div>
          </div>
          <div className="min-w-0 text-right text-[9px] text-[#0f172a]">
            <div>{company.companyPhone}</div>
            <div className="break-all">{company.companyEmail}</div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-[26px] font-bold leading-tight text-[#0f172a]">CAR RENTAL AGREEMENT</h2>
          <div className="mt-2 text-[11px]">Signed by both parties - legally binding</div>
          <div className="mt-5 text-[9px] text-[#566478]">
            Document ID: {contractNumber} | Date of Issue: {today}
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div>
            <SectionTitle num={1} title="CLIENT DETAILS" />
            <ListCard
              rows={[
                ["Full Name", valueOrDash(c?.full_name)],
                ["Phone", valueOrDash(c?.phone)],
                ["Nationality", valueOrDash(c?.nationality)],
                ["License Number", valueOrDash(licenseNumber)],
                [idLabel, idValue],
              ]}
            />
          </div>
          <div>
            <SectionTitle num={2} title="VEHICLE DETAILS" />
            <ListCard rows={vehicleRows} />
          </div>
        </div>

        <div className="mt-8">
          <SectionTitle num={3} title="RENTAL PERIOD" />
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldCard label="Start Date" value={fmtDateTime(contract.start_date, contract.start_time)} />
            <FieldCard label="End Date" value={fmtDateTime(contract.end_date, contract.end_time)} />
            <FieldCard label="Rate Type" value={contract.rate_type} />
          </div>
        </div>

        <div className="mt-8">
          <SectionTitle num={4} title="FINANCIAL SUMMARY" />
          <div className="rounded border border-[#d6e0eb] bg-[#f9fbfd] p-2">
            <div className="grid gap-2 sm:grid-cols-4">
              <SummaryTile label={`${contract.rate_type} Rate`} value={money(contract.rate_amount)} />
              <SummaryTile label="Total Rental Amount" value={money(contract.total_amount)} accent />
              <SummaryTile label="Deposit Held" value={money(contract.deposit_amount)} accent />
              <SummaryTile label="Traffic Charges" value="Per contract" />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <SectionTitle num={5} title="VEHICLE CONDITION AT PICK-UP" />
          <div className="grid gap-3 sm:grid-cols-3">
            {conditionRows.map(([label, value]) => (
              <FieldCard key={label} label={label} value={value} />
            ))}
          </div>
          <div className="mt-3 flex min-h-[64px] items-center justify-between gap-3 rounded border border-[#d6e0eb] bg-white p-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-[#0f172a]">Inspection Photos</div>
              <div className="mt-1 text-[9px] text-[#566478]">Scan to view vehicle inspection photos.</div>
            </div>
            {inspectionQr ? (
              <img src={inspectionQr} alt="Inspection photos QR" className="h-[54px] w-[54px] shrink-0" />
            ) : (
              <div className="h-[54px] w-[54px] shrink-0 rounded border border-[#d6e0eb]" />
            )}
          </div>
        </div>
      </ContractPage>

      <ContractPage pageNo={2}>
        <SectionTitle num={6} title="TERMS OF USE" />
        <ol className="mt-5 space-y-4 text-[11px] leading-relaxed text-[#0f172a]">
          {termsBullets.map((term, index) => (
            <li key={`${index}-${term.slice(0, 20)}`} className="grid grid-cols-[28px,1fr] gap-2">
              <span className="font-bold">{index + 1}.</span>
              <span>{term}</span>
            </li>
          ))}
        </ol>
      </ContractPage>

      <ContractPage pageNo={3}>
        <SectionTitle num={7} title="RETURN CHECK-IN" />
        <div className="-mt-2 text-[9px] text-[#566478]">To be completed when the vehicle is returned</div>
        <div className="mt-4 rounded border border-[#d6e0eb] bg-white p-5">
          <div className="text-[12px] font-bold">To be completed when the vehicle is returned.</div>
          <div className="mt-3 text-[10px] leading-relaxed text-[#566478]">
            Return mileage, fuel level, damage notes, and photos will be recorded at check-in.
          </div>
        </div>

        <div className="mt-10">
          <SectionTitle num={8} title="AGREEMENT & SIGNATURES" />
          <p className="text-[10px] leading-relaxed text-[#0f172a]">
            By signing below, both parties confirm that they have read, understood, and agreed to all terms and
            conditions stated in this Car Rental Agreement.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <SignatureBox
              title="CUSTOMER"
              signer={c?.full_name || ""}
              canvasRef={clientSigRef}
              onStroke={onClientStroke}
              onClear={onClientClear}
            />
            <SignatureBox
              title="COMPANY REPRESENTATIVE"
              signer={company.companyName}
              canvasRef={managerSigRef}
              onStroke={onManagerStroke}
              onClear={onManagerClear}
            />
          </div>
        </div>

        <div className="mt-6 rounded border border-[#d6e0eb] bg-[#f9fbfd] p-4">
          <div className="grid grid-cols-2 divide-x divide-[#d6e0eb] text-center">
            <div>
              <div className="text-[10px] font-bold text-[#005ab3]">Total Rental Amount</div>
              <div className="mt-3 font-mono text-[16px] font-bold text-[#005ab3]">{money(contract.total_amount)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#005ab3]">Deposit Held</div>
              <div className="mt-3 font-mono text-[16px] font-bold text-[#005ab3]">{money(contract.deposit_amount)}</div>
            </div>
          </div>
        </div>
      </ContractPage>
    </div>
  );
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
  const [pdfUrl, setPdfUrl] = useState("");

  const clientSigRef = useRef<SigRef>(null);
  const managerSigRef = useRef<SigRef>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    setStep("review");
    setSaving(false);
    setClientSigHasContent(false);
    setManagerSigHasContent(false);
    setClientSigDataUrl("");
    setManagerSigDataUrl("");
    setSummary(null);
    setPdfUrl("");
    setLoadError("");
    setLoadingData(true);

    const load = async () => {
      try {
        const [contractRes, authRes] = await Promise.all([
          supabase
            .from("contracts")
            .select(
              "*, clients(full_name, phone, nationality, client_type, emirates_id, passport_number, license_number), cars(plate, make, model, year, color)",
            )
            .eq("id", contractId)
            .single(),
          supabase.auth.getUser(),
        ]);

        if (contractRes.error || !contractRes.data) {
          const message = contractRes.error?.message || "Contract was not found.";
          if (!cancelled) {
            setLoadError(message);
            toast.error("Could not open signature step: " + message);
          }
          return;
        }

        const user = authRes.data.user;
        let profile: CompanyProfile = {
          companyName: "Rental Company",
          companyPhone: "",
          companyEmail: user?.email || "",
          termsEn: "",
          logoUrl: null,
        };

        if (user) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("company_name, logo_url, phone_number, terms_en, email")
            .eq("id", user.id)
            .single();

          if (profileData) {
            const p = profileData as {
              company_name?: string | null;
              logo_url?: string | null;
              phone_number?: string | null;
              terms_en?: string | null;
              email?: string | null;
            };
            let logoUrl = p.logo_url || null;
            if (logoUrl && !logoUrl.startsWith("http")) {
              const { data: signed } = await supabase.storage.from("company-logos").createSignedUrl(logoUrl, 60);
              logoUrl = signed?.signedUrl || null;
            }
            profile = {
              companyName: p.company_name || profile.companyName,
              companyPhone: p.phone_number || "",
              companyEmail: p.email || user.email || "",
              termsEn: p.terms_en || "",
              logoUrl,
            };
          }
        }

        const pdfData = contractRes.data as unknown as ContractForPdf;
        const previewData = contractRes.data as unknown as PreviewContract;
        const client = pdfData.clients?.full_name ?? clientName;

        if (!cancelled) {
          setSummary({ clientName: client, pdfData, previewData, profile });
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
                Scroll to the agreement section and sign in place
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-muted/30 px-3 py-3 sm:px-6 sm:py-5">
          {step === "review" && (
            <>
              {loadingData ? (
                <div className="mx-auto max-w-[794px] rounded-md border border-border bg-background py-12 text-center text-sm text-muted-foreground">
                  Loading contract preview...
                </div>
              ) : loadError ? (
                <div className="mx-auto max-w-[794px] rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  Could not load this contract for signing. {loadError}
                </div>
              ) : summary ? (
                <ContractHtmlPreview
                  summary={summary}
                  clientSigRef={clientSigRef}
                  managerSigRef={managerSigRef}
                  onClientStroke={() => setClientSigHasContent(true)}
                  onManagerStroke={() => setManagerSigHasContent(true)}
                  onClientClear={() => {
                    clientSigRef.current?.clear();
                    setClientSigHasContent(false);
                  }}
                  onManagerClear={() => {
                    managerSigRef.current?.clear();
                    setManagerSigHasContent(false);
                  }}
                />
              ) : null}
            </>
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

        {step === "review" && clientSigHasContent && managerSigHasContent && (
          <div className="shrink-0 border-t border-border bg-background px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex justify-end">
              <Button
                className="min-h-10"
                disabled={loadingData || !!loadError || saving}
                onClick={handleSave}
              >
                {saving ? "Saving..." : "Complete & Save"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="shrink-0 border-t border-border bg-background px-4 py-3 sm:px-6 sm:py-4">
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
