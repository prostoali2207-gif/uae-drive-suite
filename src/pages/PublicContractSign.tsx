import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, FileText, Loader2, PenLine, Trash2, Undo2, X } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SmoothSignatureCanvas, type SmoothSignatureCanvasRef } from "@/components/SmoothSignatureCanvas";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Driver = { id: string; position: number; name: string; license_number?: string | null; signed: boolean };
type Payload = {
  contract: { id: string; start_date: string; start_time?: string; end_date: string; end_time?: string; rate_type?: string; rate_amount?: number; total_amount?: number; deposit_amount?: number; customer_signed: boolean; manager_signed: boolean };
  customer: { name: string; license_number?: string | null };
  vehicle: { plate: string; make?: string; model?: string; year?: number; color?: string };
  company: { name: string; phone?: string; terms?: string; key_terms?: string };
  drivers: Driver[];
  accepted: boolean;
  expires_at: string;
};

function SignaturePad({ onSave, onCancel, signerName }: { onSave: (value: string) => Promise<void>; onCancel: () => void; signerName: string }) {
  const ref = useRef<SmoothSignatureCanvasRef>(null);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);

  const clear = () => {
    ref.current?.clear();
    setHasInk(false);
  };
  const submit = async () => { const value = ref.current?.getDataUrl(); if (!value) return; setSaving(true); try { await onSave(value); } finally { setSaving(false); } };
  return <div><div className="flex items-center gap-3"><button type="button" aria-label="Close signature without saving" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" onClick={onCancel}><X className="h-8 w-8" /></button><div className="min-w-0 flex-1 text-center"><div className="text-xs font-semibold text-slate-400">Signature</div><div className="truncate font-bold">{signerName}</div></div><button type="button" className="h-11 rounded-full bg-white px-5 font-bold text-slate-950 disabled:opacity-40" disabled={!hasInk || saving} onClick={submit}>{saving && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}Done</button></div><div className="mt-4"><SmoothSignatureCanvas ref={ref} onStroke={() => setHasInk(true)} onClear={() => setHasInk(false)} /><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" className="flex h-12 items-center justify-center rounded-xl bg-[#222631] font-semibold text-white disabled:opacity-40" disabled={!hasInk} onClick={() => ref.current?.undo()}><Undo2 className="mr-2 h-4 w-4" />Undo stroke</button><button type="button" className="flex h-12 items-center justify-center rounded-xl bg-[#222631] font-semibold text-white disabled:opacity-40" disabled={!hasInk} onClick={clear}><Trash2 className="mr-2 h-4 w-4" />Clear</button></div></div></div>;
}

export default function PublicContractSign() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Payload | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [termsOpen, setTermsOpen] = useState(false), [termsReviewed, setTermsReviewed] = useState(false), [accepted, setAccepted] = useState(false);
  const [active, setActive] = useState<{ type: "customer" | "driver"; id?: string; name: string } | null>(null);
  const load = useCallback(async () => { setLoading(true); const result = await supabase.rpc("get_public_contract_for_signing" as never, { p_token: token } as never); if (result.error || !result.data) setError("This signing link is invalid or has expired."); else { const payload = result.data as unknown as Payload; setData(payload); setAccepted(payload.accepted); } setLoading(false); }, [token]);
  useEffect(() => { void load(); }, [load]);
  const save = async (signature: string) => {
    if (!active) return; const result = await supabase.rpc("submit_public_contract_signature" as never, { p_token: token, p_signer_type: active.type, p_driver_id: active.id || null, p_signature: signature, p_accept_terms: accepted } as never);
    if (result.error) { toast.error(result.error.message); return; } setData(result.data as unknown as Payload); setActive(null); toast.success("Signature saved");
  };
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-100"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>;
  if (error || !data) return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-5"><div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center text-red-700">{error}</div></div>;
  const keyTerms = String(data.company.key_terms || "").split(/\r?\n/).filter(Boolean);
  const allCustomerSignatures = data.contract.customer_signed && data.drivers.every((driver) => driver.signed);
  return <div className="min-h-screen bg-slate-100 text-slate-950">
    <header className="bg-cyan-600 px-4 py-4 text-white"><div className="mx-auto max-w-3xl"><div className="flex items-center gap-2 font-bold"><FileText className="h-5 w-5" />{data.company.name}</div><div className="mt-1 text-sm text-cyan-50">Rental contract review and signing</div></div></header>
    <main className="mx-auto max-w-3xl space-y-4 p-3 pb-10 sm:p-6">
      <section className="rounded-xl border bg-white p-4"><h1 className="text-xl font-bold">Check your contract</h1><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><div className="text-slate-500">Customer</div><b>{data.customer.name}</b></div><div><div className="text-slate-500">Vehicle</div><b>{data.vehicle.plate} · {data.vehicle.make} {data.vehicle.model}</b></div><div><div className="text-slate-500">Rental period</div><b>{data.contract.start_date} → {data.contract.end_date}</b></div><div><div className="text-slate-500">Total</div><b>AED {Number(data.contract.total_amount || 0).toLocaleString()}</b></div><div className="col-span-2 rounded-lg bg-amber-50 p-3"><div className="text-amber-800">Deposit held separately</div><b>AED {Number(data.contract.deposit_amount || 0).toLocaleString()}</b></div></div></section>
      <section className="rounded-xl border bg-white p-4"><h2 className="font-bold">Terms</h2><div className="mt-3 space-y-2 text-sm">{(keyTerms.length ? keyTerms : ["The customer accepts the rental terms and vehicle responsibility."]).map((item, i) => <div key={i}>• {item}</div>)}</div><button className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg border px-3 text-sm font-semibold" onClick={() => { setTermsOpen(!termsOpen); setTermsReviewed(true); }}>Full contract terms<ChevronDown className={`h-4 w-4 ${termsOpen ? "rotate-180" : ""}`} /></button>{termsOpen && <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed">{data.company.terms || "No additional terms."}</div>}<label className={`mt-4 flex min-h-12 gap-3 rounded-lg border-2 p-3 text-sm ${data.accepted || termsReviewed ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-slate-100 text-slate-500"}`}><input type="checkbox" className="h-5 w-5" checked={accepted} disabled={data.accepted || !termsReviewed} onChange={(e) => setAccepted(e.target.checked)} /><span>{data.accepted || termsReviewed ? "I have read and accept the contract terms." : "Open the full contract terms above before accepting."}</span></label></section>
      <section className="rounded-xl border bg-white p-4"><h2 className="font-bold">Required signatures</h2><div className="mt-3 space-y-3">{[{ type: "customer" as const, name: data.customer.name, signed: data.contract.customer_signed }, ...data.drivers.map(d => ({ type: "driver" as const, id: d.id, name: d.name, signed: d.signed }))].map((person) => <div key={`${person.type}-${person.id || "main"}`} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><div className="truncate font-semibold">{person.name}</div><div className="text-xs text-slate-500">{person.type === "customer" ? "Main customer" : "Additional driver"}</div></div>{person.signed ? <span className="flex items-center gap-1 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Signed</span> : <Button className="h-11 bg-cyan-600 text-white" disabled={!accepted} onClick={() => setActive({ type: person.type, id: person.id, name: person.name })}><PenLine className="mr-2 h-4 w-4" />Sign</Button>}</div>)}</div>{allCustomerSignatures && <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-center font-bold text-emerald-800">All customer signatures are complete. The manager can now finalize the contract.</div>}</section>
    </main>
    {active && <div className="fixed inset-0 z-50 h-[100dvh] overflow-y-auto bg-[#191b20] p-3 text-white"><div className="mx-auto w-full max-w-4xl"><SignaturePad onSave={save} onCancel={() => setActive(null)} signerName={active.name} /></div></div>}
  </div>;
}
