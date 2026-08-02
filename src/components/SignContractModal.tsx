import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Copy, FileText, Link2, Loader2, MessageCircle, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { generateContractPdf } from "@/lib/contractPdf";
import {
  getContractDrivers,
  saveContractDriverSignatures,
  type ContractDriverRow,
} from "@/lib/contractDrivers";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SmoothSignatureCanvas, type SmoothSignatureCanvasRef } from "@/components/SmoothSignatureCanvas";

type ContractForPdf = Parameters<typeof generateContractPdf>[0];
type FlowStep = "review" | "terms" | "sign" | "success";
type Signer = { key: string; label: string; name: string; driver?: ContractDriverRow };

interface LoadedContract {
  data: ContractForPdf;
  drivers: ContractDriverRow[];
  companyName: string;
  companyPhone: string;
  termsEn: string;
  keyTerms: string[];
}

interface SignContractModalProps {
  contractId: string;
  clientName: string;
  open: boolean;
  onActivate: () => Promise<boolean>;
  onComplete: () => void;
}

function money(value: unknown) {
  return `AED ${Number(value || 0).toLocaleString()}`;
}

function dateTime(date: unknown, time: unknown) {
  if (!date) return "—";
  const formatted = new Date(`${String(date)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return time ? `${formatted} ${String(time).slice(0, 5)}` : formatted;
}

function SummaryItem({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-white p-3", accent ? "border-amber-300 bg-amber-50" : "border-slate-200")}>
      <div className={cn("text-xs font-bold uppercase tracking-wide", accent ? "text-amber-800" : "text-slate-500")}>{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export function SignContractModal({ contractId, clientName, open, onActivate, onComplete }: SignContractModalProps) {
  const [step, setStep] = useState<FlowStep>("review");
  const [loaded, setLoaded] = useState<LoadedContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [termsExpanded, setTermsExpanded] = useState(false);
  const [fullTermsOpened, setFullTermsOpened] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [activeSigner, setActiveSigner] = useState(0);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [canvasHasContent, setCanvasHasContent] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [clientLink, setClientLink] = useState("");
  const signatureRef = useRef<SmoothSignatureCanvasRef>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep("review");
    setLoaded(null);
    setError("");
    setTermsExpanded(false);
    setFullTermsOpened(false);
    setTermsAccepted(false);
    setActiveSigner(0);
    setSignatures({});
    setPdfUrl("");
    setSignatureOpen(false);
    setClientLink("");
    setLoading(true);

    const load = async () => {
      try {
        const [contractResult, authResult, drivers] = await Promise.all([
          supabase
            .from("contracts")
            .select("*, clients(full_name, phone, nationality, client_type, emirates_id, passport_number, license_number), cars(plate, make, model, year, color)")
            .eq("id", contractId)
            .single(),
          supabase.auth.getUser(),
          getContractDrivers(contractId),
        ]);
        if (contractResult.error || !contractResult.data) throw new Error(contractResult.error?.message || "Contract not found");

        const user = authResult.data.user;
        let companyName = "Rental Company";
        let companyPhone = "";
        let termsEn = "";
        let keyTerms: string[] = [];
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_name, phone_number, terms_en, terms_key_points")
            .eq("id", user.id)
            .single();
          companyName = profile?.company_name || companyName;
          companyPhone = profile?.phone_number || "";
          termsEn = profile?.terms_en || "";
          keyTerms = String((profile as { terms_key_points?: string | null } | null)?.terms_key_points || "")
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
        }

        if (!cancelled) {
          setLoaded({
            data: contractResult.data as unknown as ContractForPdf,
            drivers,
            companyName,
            companyPhone,
            termsEn,
            keyTerms,
          });
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Could not load contract";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [open, contractId]);

  const signers = useMemo<Signer[]>(() => {
    if (!loaded) return [];
    const contract = loaded.data as ContractForPdf & { clients?: { full_name?: string | null } | null };
    return [
      { key: "customer", label: "Main customer", name: contract.clients?.full_name || clientName },
      ...loaded.drivers.map((driver) => ({
        key: `driver-${driver.id}`,
        label: `Additional driver ${driver.position}`,
        name: driver.clients?.full_name || `Driver ${driver.position}`,
        driver,
      })),
      { key: "company", label: "Company representative", name: loaded.companyName },
    ];
  }, [loaded, clientName]);

  const signer = signers[activeSigner];
  const signedCount = signers.filter((item) => signatures[item.key]).length;

  const saveCurrentSignature = () => {
    if (!signer || !signatureRef.current || signatureRef.current.isEmpty()) {
      toast.error("Please add this signature first.");
      return;
    }
    const dataUrl = signatureRef.current.getDataUrl();
    setSignatures((current) => ({ ...current, [signer.key]: dataUrl }));
    setSignatureOpen(false);
    signatureRef.current.clear();
    setCanvasHasContent(false);
    if (activeSigner < signers.length - 1) setActiveSigner((current) => current + 1);
  };

  const createClientLink = async () => {
    setCreatingLink(true);
    try {
      const { data, error: linkError } = await supabase.rpc(
        "create_contract_signing_link" as never,
        { p_contract_id: contractId, p_valid_days: 7 } as never,
      );
      if (linkError) throw linkError;
      const link = `${window.location.origin}/sign/${String(data)}`;
      setClientLink(link);
      await navigator.clipboard.writeText(link);
      toast.success("Client link copied");
    } catch (linkError) {
      toast.error(linkError instanceof Error ? linkError.message : "Could not create client link");
    } finally {
      setCreatingLink(false);
    }
  };

  const completeSigning = async () => {
    if (!loaded) return;
    const customerSignature = signatures.customer;
    const companySignature = signatures.company;
    const missing = signers.find((item) => !signatures[item.key]);
    if (!customerSignature || !companySignature || missing) {
      toast.error(`Signature required: ${missing?.name || "all participants"}`);
      return;
    }

    setSaving(true);
    try {
      const { error: contractError } = await supabase
        .from("contracts")
        .update({ client_signature: customerSignature, manager_signature: companySignature })
        .eq("id", contractId);
      if (contractError) throw contractError;

      const driverSignatures = loaded.drivers.map((driver) => ({
        id: driver.id,
        signature: signatures[`driver-${driver.id}`],
      }));
      await saveContractDriverSignatures(driverSignatures);

      const signedDrivers = loaded.drivers.map((driver) => ({
        ...driver,
        signature: signatures[`driver-${driver.id}`],
        signed_at: new Date().toISOString(),
      }));

      const blob = await generateContractPdf(
        {
          ...loaded.data,
          client_signature: customerSignature,
          manager_signature: companySignature,
          contract_drivers: signedDrivers,
        },
        { returnBlob: true },
      ) as Blob;
      const filePath = `${contractId}.pdf`;
      const { error: uploadError } = await supabase.storage.from("contract-pdfs").upload(filePath, blob, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const publicUrl = supabase.storage.from("contract-pdfs").getPublicUrl(filePath).data.publicUrl;
      setPdfUrl(publicUrl);
      const activated = await onActivate();
      if (!activated) return;
      setStep("success");
      toast.success("Contract signed and activated");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Could not save signatures");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const contract = loaded?.data as (ContractForPdf & {
    clients?: { full_name?: string | null; phone?: string | null; license_number?: string | null } | null;
    cars?: { plate?: string | null; make?: string | null; model?: string | null } | null;
    start_date?: string;
    start_time?: string;
    end_date?: string;
    end_time?: string;
    rate_type?: string;
    rate_amount?: number;
    total_amount?: number;
    deposit_amount?: number;
    initial_mileage?: number;
    fuel_level?: string;
  }) | null;

  return (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="shrink-0 border-b border-cyan-700 bg-cyan-600 px-3 py-3 text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-bold"><FileText className="h-4 w-4" /> Contract signing</div>
            <div className="truncate text-xs text-cyan-50">Review → terms → all participants → completed</div>
          </div>
          <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
            {step === "review" ? "1/4" : step === "terms" ? "2/4" : step === "sign" ? "3/4" : "4/4"}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          {loading && <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-600" /></div>}
          {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          {!loading && !error && loaded && contract && step === "review" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">Check the contract</h2>
                <p className="text-sm text-slate-600">Additional drivers are shown here and each one will sign separately.</p>
              </div>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryItem label="Main customer" value={contract.clients?.full_name || clientName} />
                  <SummaryItem label="Vehicle" value={`${contract.cars?.plate || "—"} · ${contract.cars?.make || ""} ${contract.cars?.model || ""}`} />
                  <SummaryItem label="Rental period" value={`${dateTime(contract.start_date, contract.start_time)} → ${dateTime(contract.end_date, contract.end_time)}`} />
                  <SummaryItem label="Rate" value={`${contract.rate_type || "—"} · ${money(contract.rate_amount)}`} />
                  <SummaryItem label="Rental total" value={money(contract.total_amount)} />
                  <SummaryItem label="Deposit held separately" value={money(contract.deposit_amount)} accent />
                  <SummaryItem label="Initial mileage" value={`${Number(contract.initial_mileage || 0).toLocaleString()} km`} />
                  <SummaryItem label="Fuel" value={contract.fuel_level || "—"} />
                </div>
              </section>
              <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <div className="font-bold text-cyan-950">Customer can sign on their phone</div>
                <p className="mt-1 text-sm text-cyan-800">The private link works for 7 days and lets the customer sign only their permitted fields.</p>
                <Button type="button" className="mt-3 h-11 w-full bg-cyan-600 text-white hover:bg-cyan-700" disabled={creatingLink} onClick={createClientLink}>
                  {creatingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}{clientLink ? "Create a new link" : "Create client link"}
                </Button>
                {clientLink && <button type="button" className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-cyan-300 bg-white px-3 text-sm font-semibold text-cyan-800" onClick={async () => { await navigator.clipboard.writeText(clientLink); toast.success("Link copied"); }}><Copy className="h-4 w-4" />Copy link again</button>}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-bold">Authorized additional drivers ({loaded.drivers.length})</div>
                {loaded.drivers.length === 0 ? (
                  <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-500">No additional drivers</div>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {loaded.drivers.map((driver) => (
                      <div key={driver.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="font-semibold">{driver.position}. {driver.clients?.full_name || "Unknown driver"}</div>
                        <div className="mt-1 text-xs text-slate-500">License: {driver.clients?.license_number || "Missing"}</div>
                        <div className="text-xs text-slate-500">Expiry: {driver.clients?.license_expiry || "Missing"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {!loading && !error && loaded && step === "terms" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">Terms and responsibility</h2>
                <p className="text-sm text-slate-600">The customer reads and accepts the contract before anyone signs.</p>
              </div>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-bold">Key terms</div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {(loaded.keyTerms.length ? loaded.keyTerms : [
                    "Deposit is separate from rental payments.",
                    "The customer is responsible for fines, Salik and damage during the rental period.",
                    "The vehicle must be returned on time with the agreed fuel and condition.",
                  ]).map((term, index) => <div key={index} className="flex gap-2"><span className="font-bold text-cyan-700">•</span><span>{term}</span></div>)}
                </div>
                <button type="button" className="mt-4 flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-300 px-3 text-left text-sm font-semibold" onClick={() => { setTermsExpanded((current) => !current); setFullTermsOpened(true); }}>
                  Full contract terms
                  <ChevronDown className={cn("h-4 w-4 transition-transform", termsExpanded && "rotate-180")} />
                </button>
                {termsExpanded && <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{loaded.termsEn || "No custom full terms have been configured."}</div>}
                <label className={cn("mt-4 flex min-h-12 items-start gap-3 rounded-lg border-2 p-3 text-sm", fullTermsOpened ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-slate-100 text-slate-500")}>
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-cyan-600" checked={termsAccepted} disabled={!fullTermsOpened} onChange={(event) => setTermsAccepted(event.target.checked)} />
                  <span>{fullTermsOpened ? "I have read and agree to the rental terms, deposit rules, fines, Salik and vehicle responsibility." : "Open the full contract terms above before accepting."}</span>
                </label>
              </section>
            </div>
          )}

          {!loading && !error && loaded && step === "sign" && signer && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">Signatures</h2>
                <p className="text-sm text-slate-600">Pass the phone in this order. Every person signs only their own section.</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {signers.map((item, index) => (
                  <button key={item.key} type="button" onClick={() => { setActiveSigner(index); signatureRef.current?.clear(); setCanvasHasContent(false); }} className={cn("min-h-11 shrink-0 rounded-lg border px-3 text-left text-xs font-semibold", index === activeSigner ? "border-cyan-600 bg-cyan-50 text-cyan-800" : "border-slate-300 bg-white text-slate-700", signatures[item.key] && "border-emerald-400 bg-emerald-50 text-emerald-800")}>
                    {signatures[item.key] ? <Check className="mr-1 inline h-3.5 w-3.5" /> : null}{item.name}
                  </button>
                ))}
              </div>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-cyan-700">{signer.label}</div>
                    <div className="mt-1 text-lg font-bold">{signer.name}</div>
                    {signer.driver && <div className="mt-1 text-xs text-slate-500">License: {signer.driver.clients?.license_number || "Missing"}</div>}
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{signedCount}/{signers.length} signed</div>
                </div>

                {signatures[signer.key] ? (
                  <div className="mt-4">
                    <img src={signatures[signer.key]} alt="Saved signature" className="h-44 w-full rounded-xl border-2 border-emerald-300 bg-white object-contain" />
                    <Button type="button" variant="outline" className="mt-3 h-11 w-full border-slate-300" onClick={() => setSignatures((current) => { const next = { ...current }; delete next[signer.key]; return next; })}>Redo signature</Button>
                  </div>
                ) : (
                  <div className="mt-4">
                    <button type="button" className="flex h-36 w-full items-center justify-center rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-50 text-base font-bold text-cyan-800" onClick={() => setSignatureOpen(true)}><PenLine className="mr-2 h-5 w-5" />Sign in full screen</button>
                  </div>
                )}
              </section>
            </div>
          )}

          {!loading && !error && loaded && step === "success" && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-10 w-10" /></div>
              <h2 className="mt-5 text-2xl font-bold">Contract is active</h2>
              <p className="mt-2 text-sm text-slate-600">All signatures are saved, the PDF is ready and the vehicle is marked as rented.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button variant="outline" className="h-12 border-slate-300 bg-white" onClick={() => generateContractPdf({ ...loaded.data, client_signature: signatures.customer, manager_signature: signatures.company, contract_drivers: loaded.drivers.map((driver) => ({ ...driver, signature: signatures[`driver-${driver.id}`] })) })}>Download PDF</Button>
                <Button className="h-12 gap-2 bg-green-600 text-white hover:bg-green-700" onClick={() => {
                  const phone = String((loaded.data as ContractForPdf & { clients?: { phone?: string | null } | null }).clients?.phone || "").replace(/[\s\-()]/g, "");
                  const text = encodeURIComponent(pdfUrl ? `Your signed rental contract: ${pdfUrl}` : `Your rental contract is signed. Contract ID: ${contractId}`);
                  window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
                }}><MessageCircle className="h-4 w-4" />Send via WhatsApp</Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {!loading && !error && loaded && step !== "success" && (
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <Button type="button" variant="outline" className="h-11 border-slate-300 bg-white" disabled={step === "review"} onClick={() => setStep(step === "sign" ? "terms" : "review")}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back
            </Button>
            {step === "review" && <Button className="h-11 bg-cyan-600 px-6 font-bold text-white hover:bg-cyan-700" onClick={() => setStep("terms")}>Continue to terms</Button>}
            {step === "terms" && <Button className="h-11 bg-cyan-600 px-6 font-bold text-white hover:bg-cyan-700" disabled={!termsAccepted} onClick={() => setStep("sign")}><PenLine className="mr-2 h-4 w-4" />Start signing</Button>}
            {step === "sign" && <Button className="h-11 bg-cyan-600 px-6 font-bold text-white hover:bg-cyan-700" disabled={signedCount !== signers.length || saving} onClick={completeSigning}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{saving ? "Saving..." : "Save & activate contract"}</Button>}
          </div>
        </footer>
      )}

      {step === "success" && (
        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-3">
          <div className="mx-auto max-w-5xl"><Button className="h-12 w-full bg-cyan-600 font-bold text-white hover:bg-cyan-700" onClick={onComplete}>Open contract</Button></div>
        </footer>
      )}

      {signatureOpen && signer && (
        <div className="fixed inset-0 z-[120] flex h-[100dvh] flex-col bg-[#191b20] p-3 text-white">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 py-2">
            <button type="button" aria-label="Close signature without saving" className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10" onClick={() => setSignatureOpen(false)}><X className="h-8 w-8" /></button>
            <div className="min-w-0 flex-1 text-center"><div className="truncate text-xs font-semibold text-slate-400">{signer.label}</div><div className="truncate font-bold">{signer.name}</div></div>
            <button type="button" className="h-11 rounded-full bg-white px-5 font-bold text-slate-950 disabled:opacity-40" disabled={!canvasHasContent} onClick={saveCurrentSignature}>Done</button>
          </div>
          <div className="mx-auto mt-2 w-full max-w-5xl flex-1"><SmoothSignatureCanvas ref={signatureRef} onStroke={() => setCanvasHasContent(true)} /></div>
          <div className="mx-auto w-full max-w-5xl pb-2 pt-3">
            <button type="button" className="h-12 w-full rounded-xl bg-[#222631] font-semibold text-white hover:bg-[#2b303d]" onClick={() => { signatureRef.current?.clear(); setCanvasHasContent(false); }}>Clear signature</button>
          </div>
        </div>
      )}
    </div>
  );
}
