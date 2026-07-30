import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Check, ChevronRight, Image as ImageIcon, Loader2, Plus, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdditionalDriversField } from "@/components/AdditionalDriversField";
import { SignContractModal } from "@/components/SignContractModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { findVehicleContractOverlap, formatContractOverlapMessage } from "@/lib/contractOverlap";
import { formatMonthlyBillingPeriod, getRateUnits } from "@/lib/contractPricing";
import { parseDateTimeInput } from "@/lib/dateUtils";
import { saveContractDrivers } from "@/lib/contractDrivers";
import { syncVehicleStatusesWithContracts } from "@/lib/vehicleStatusSync";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";
import { toast } from "sonner";

type FuelLevel = "Empty" | "Quarter" | "Half" | "Three Quarters" | "Full";
type RateType = "Daily" | "Monthly" | "Annual";
type ChargeLabel = "Delivery" | "Pickup" | "Full Tank" | "Baby Seat" | "Other";
type Step = 1 | 2 | 3 | 4;

interface ClientOption { id: string; full_name: string; license_number: string; license_expiry: string | null; }
interface CarOption { id: string; plate: string; make: string; model: string; status: string; }
interface Charge { id: string; label: ChargeLabel; amount: string; }
interface PickupPhoto { id: string; photo_url: string; }

const fuelLevels: FuelLevel[] = ["Empty", "Quarter", "Half", "Three Quarters", "Full"];
const rateTypes: RateType[] = ["Daily", "Monthly", "Annual"];
const chargeLabels: ChargeLabel[] = ["Delivery", "Pickup", "Full Tank", "Baby Seat", "Other"];
const chargeCategories: Record<ChargeLabel, "delivery" | "pickup" | "fuel" | "other"> = {
  Delivery: "delivery", Pickup: "pickup", "Full Tank": "fuel", "Baby Seat": "other", Other: "other",
};
const stepLabels = ["Contract details", "Vehicle condition", "Review & sign", "Completed"];
const inputClass = "h-11 border-2 border-cyan-500 bg-white text-slate-950 placeholder:text-slate-500 shadow-none focus-visible:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-200";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function roundedTime() {
  const d = new Date();
  const mins = Math.ceil((d.getHours() * 60 + d.getMinutes()) / 5) * 5;
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function uuid() { return crypto.randomUUID(); }
function dbTime(value: string) { return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value; }

export default function NewContract() {
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [clientOpen, setClientOpen] = useState(false);
  const [carOpen, setCarOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [carSearch, setCarSearch] = useState("");
  const [additionalDriverIds, setAdditionalDriverIds] = useState<string[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [contractId, setContractId] = useState("");
  const [userId, setUserId] = useState("");
  const [clientName, setClientName] = useState("");
  const [photos, setPhotos] = useState<PickupPhoto[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [signOpen, setSignOpen] = useState(false);
  const [form, setForm] = useState({
    client_id: "", car_id: "", start_date: todayInput(), start_time: roundedTime(), end_date: "", end_time: roundedTime(),
    rate_type: "Daily" as RateType, rate_amount: "", deposit_amount: "", initial_mileage: "", fuel_level: "Full" as FuelLevel, notes: "",
  });

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { toast.error("Please sign in again."); navigate("/auth"); return; }
      setUserId(uid);
      const [clientsRes, carsRes] = await Promise.all([
        supabase.from("clients").select("id, full_name, license_number, license_expiry").eq("owner_id", uid).order("full_name"),
        supabase.from("cars").select("id, plate, make, model, status").eq("owner_id", uid).order("plate"),
      ]);
      if (clientsRes.error || carsRes.error) toast.error("Could not load clients or vehicles.");
      setClients((clientsRes.data || []) as ClientOption[]);
      setCars((carsRes.data || []) as CarOption[]);
      setLoading(false);
    };
    load();
  }, [navigate]);

  const availableCars = useMemo(() => cars.filter((car) => car.status?.toLowerCase() === "available"), [cars]);
  const filteredClients = useMemo(() => clients.filter((c) => c.full_name.toLowerCase().includes(clientSearch.toLowerCase())), [clients, clientSearch]);
  const filteredCars = useMemo(() => availableCars.filter((c) => `${c.plate} ${c.make} ${c.model}`.toLowerCase().includes(carSearch.toLowerCase())), [availableCars, carSearch]);
  const selectedClient = clients.find((c) => c.id === form.client_id);
  const selectedCar = availableCars.find((c) => c.id === form.car_id);
  const rentalDays = useMemo(() => {
    const start = parseDateTimeInput(form.start_date, form.start_time);
    const end = parseDateTimeInput(form.end_date, form.end_time);
    if (!start || !end || end <= start) return 0;
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  }, [form]);
  const rentalTotal = useMemo(() => {
    const rate = Number(form.rate_amount);
    if (!Number.isFinite(rate) || rate <= 0 || rentalDays <= 0) return 0;
    return Math.round(getRateUnits(rentalDays, form.rate_type, form.start_date, form.end_date) * rate);
  }, [form, rentalDays]);
  const extrasTotal = useMemo(() => charges.reduce((sum, c) => sum + (Number(c.amount) > 0 ? Number(c.amount) : 0), 0), [charges]);
  const grandTotal = rentalTotal + extrasTotal;

  const prefillMileage = async (carId: string) => {
    setForm((p) => ({ ...p, car_id: carId, initial_mileage: "" }));
    const { data } = await (supabase as any).from("car_maintenance").select("current_mileage").eq("car_id", carId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.current_mileage != null) setForm((p) => ({ ...p, initial_mileage: String(data.current_mileage) }));
  };

  const validate = () => {
    if (!form.client_id) return "Select a client.";
    if (!form.car_id) return "Select a vehicle.";
    if (!form.end_date) return "Select the return date.";
    if (rentalDays <= 0) return "Return date and time must be after pickup.";
    if (!(Number(form.rate_amount) > 0)) return "Enter a valid rental rate.";
    if (form.initial_mileage === "" || Number(form.initial_mileage) < 0) return "Enter valid initial mileage.";
    if (form.deposit_amount !== "" && Number(form.deposit_amount) < 0) return "Enter a valid deposit.";
    return "";
  };

  const createContract = async () => {
    const errorText = validate();
    if (errorText) { toast.error(errorText); return; }
    setSubmitting(true);
    try {
      const conflict = await findVehicleContractOverlap(supabase, {
        carId: form.car_id, startDate: form.start_date, startTime: form.start_time,
        endDate: form.end_date, endTime: form.end_time, operation: "contract-create-page",
      });
      if (conflict) { toast.error(formatContractOverlapMessage(conflict)); return; }
      const id = uuid();
      const { error } = await supabase.from("contracts").insert({
        id, client_id: form.client_id, car_id: form.car_id, start_date: form.start_date, end_date: form.end_date,
        start_time: dbTime(form.start_time), end_time: dbTime(form.end_time), rate_type: form.rate_type,
        rate_amount: Number(form.rate_amount), total_amount: rentalTotal, deposit_amount: form.deposit_amount === "" ? 0 : Number(form.deposit_amount),
        initial_mileage: Number(form.initial_mileage), fuel_level: form.fuel_level, status: "Active", payment_status: "Unpaid",
        notes: form.notes.trim() || null, owner_id: userId,
      });
      if (error) throw error;
      try {
        await saveContractDrivers(id, userId, additionalDriverIds);
      } catch (driverError) {
        await supabase.from("contracts").delete().eq("id", id);
        throw driverError;
      }
      const validCharges = charges.filter((c) => c.label && Number(c.amount) > 0);
      if (validCharges.length) {
        const { error: feeError } = await (supabase as any).from("contract_fees").insert(validCharges.map((c) => ({
          contract_id: id, category: chargeCategories[c.label], label: c.label, amount: Number(c.amount), owner_id: userId,
        })));
        if (feeError) toast.error("Contract created, but additional charges could not be saved.");
      }
      await syncVehicleStatusesWithContracts();
      setContractId(id);
      setClientName(selectedClient?.full_name || "Client");
      setStep(2);
      toast.success("Contract created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create contract.");
    } finally { setSubmitting(false); }
  };

  const refreshPhotos = async (id = contractId) => {
    if (!id) return;
    const { data } = await (supabase as any).from("contract_inspections").select("id, photo_url").eq("contract_id", id).eq("type", "pickup").order("uploaded_at");
    const rows = (data || []) as PickupPhoto[];
    setPhotos(rows);
    const previews: Record<string, string> = {};
    rows.forEach((photo) => { previews[photo.id] = supabase.storage.from("inspection-photos").getPublicUrl(photo.photo_url).data.publicUrl; });
    setPhotoPreviews(previews);
  };

  useEffect(() => { if (step === 2) refreshPhotos(); }, [step]);

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !contractId) return;
    const selected = Array.from(files).slice(0, Math.max(0, 10 - photos.length));
    setUploading(true);
    for (const file of selected) {
      const slot = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${contractId}/pickup/${slot}.jpg`;
      const prepared = await prepareImageForStorageUpload(file);
      logImageCompressionUpload("NewContract", file, prepared, path);
      const { error: uploadError } = await supabase.storage.from("inspection-photos").upload(path, prepared, { contentType: prepared.type || "image/jpeg", upsert: true });
      if (uploadError) { toast.error(uploadError.message); continue; }
      const { error: saveError } = await (supabase as any).from("contract_inspections").insert({
        contract_id: contractId, type: "pickup", slot, photo_url: path, uploaded_at: new Date().toISOString(), uploaded_by: userId,
      });
      if (saveError) toast.error(saveError.message);
    }
    setUploading(false);
    refreshPhotos();
  };

  const deletePhoto = async (photo: PickupPhoto) => {
    await supabase.storage.from("inspection-photos").remove([photo.photo_url]);
    await (supabase as any).from("contract_inspections").delete().eq("id", photo.id);
    refreshPhotos();
  };

  if (loading) return <DashboardLayout title="New Contract"><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div></DashboardLayout>;

  return (
    <DashboardLayout title="New Contract" subtitle="Create, inspect and sign" mobileContractsNav>
      <div className="-mx-4 -my-6 min-h-[calc(100dvh-3.5rem)] bg-[#f5f7f9] text-slate-950 md:-mx-8 md:-my-8">
        <div className="sticky top-0 z-20 border-b border-cyan-700 bg-cyan-600 text-white shadow-sm">
          <div className="mx-auto max-w-5xl px-4 py-4 md:px-8">
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" className="h-11 px-2 text-white hover:bg-white/15 hover:text-white" onClick={() => navigate("/contracts")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Contracts
              </Button>
              <span className="text-sm font-bold text-white">{step}/4</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {stepLabels.map((label, index) => {
                const number = index + 1;
                return <div key={label}><div className={cn("h-2 rounded-full", number <= step ? "bg-white" : "bg-white/35")} /><div className={cn("mt-1 hidden text-[11px] font-semibold md:block", number === step ? "text-white" : "text-white/75")}>{label}</div></div>;
              })}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
          {step === 1 && (
            <div className="space-y-5">
              <div><h2 className="text-2xl font-bold">Contract details</h2><p className="mt-1 text-sm text-slate-600">All current contract fields are kept. Nothing is removed.</p></div>

              <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-cyan-700">Client & vehicle</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2"><Label className="text-slate-800">Main client *</Label><Popover open={clientOpen} onOpenChange={setClientOpen}><PopoverTrigger asChild><Button variant="outline" className="h-11 justify-between border-slate-300 bg-white text-slate-950">{selectedClient?.full_name || "Select client"}<ChevronRight className="h-4 w-4 text-slate-400" /></Button></PopoverTrigger><PopoverContent className="z-[100] w-[var(--radix-popover-trigger-width)] border-2 border-cyan-500 bg-white p-0 text-slate-950 shadow-xl"><Command className="bg-white text-slate-950"><CommandInput className="border-b border-slate-200 bg-white text-slate-950 placeholder:text-slate-500" placeholder="Search client" value={clientSearch} onValueChange={setClientSearch} /><CommandList className="bg-white text-slate-950"><CommandEmpty>No client found.</CommandEmpty><CommandGroup className="bg-white text-slate-950">{filteredClients.map((client) => <CommandItem className="text-slate-950 aria-selected:bg-cyan-50 aria-selected:text-slate-950" key={client.id} value={client.id} onSelect={() => { setForm((p) => ({ ...p, client_id: client.id })); setAdditionalDriverIds((ids) => ids.filter((id) => id !== client.id)); setClientOpen(false); }}><Check className={cn("mr-2 h-4 w-4", form.client_id === client.id ? "opacity-100" : "opacity-0")} />{client.full_name}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover></div>
                  <div className="grid gap-2"><Label className="text-slate-800">Vehicle *</Label><Popover open={carOpen} onOpenChange={setCarOpen}><PopoverTrigger asChild><Button variant="outline" className="h-11 justify-between border-slate-300 bg-white text-slate-950">{selectedCar ? `${selectedCar.plate} — ${selectedCar.make} ${selectedCar.model}` : "Select available vehicle"}<ChevronRight className="h-4 w-4 text-slate-400" /></Button></PopoverTrigger><PopoverContent className="z-[100] w-[var(--radix-popover-trigger-width)] border-2 border-cyan-500 bg-white p-0 text-slate-950 shadow-xl"><Command className="bg-white text-slate-950"><CommandInput className="border-b border-slate-200 bg-white text-slate-950 placeholder:text-slate-500" placeholder="Search plate or model" value={carSearch} onValueChange={setCarSearch} /><CommandList className="bg-white text-slate-950"><CommandEmpty>No available vehicle found.</CommandEmpty><CommandGroup className="bg-white text-slate-950">{filteredCars.map((car) => <CommandItem className="text-slate-950 aria-selected:bg-cyan-50 aria-selected:text-slate-950" key={car.id} value={car.id} onSelect={() => { prefillMileage(car.id); setCarOpen(false); }}><Check className={cn("mr-2 h-4 w-4", form.car_id === car.id ? "opacity-100" : "opacity-0")} />{car.plate} — {car.make} {car.model}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover></div>
                </div>
                <div className="mt-4"><AdditionalDriversField clients={clients} primaryClientId={form.client_id} value={additionalDriverIds} onChange={setAdditionalDriverIds} /></div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-cyan-700">Rental period & rate</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="grid gap-2"><Label className="text-slate-800">Start date *</Label><Input type="date" className={inputClass} value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label className="text-slate-800">Start time *</Label><Input type="time" className={inputClass} value={form.start_time} onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label className="text-slate-800">End date *</Label><Input type="date" className={inputClass} value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label className="text-slate-800">End time *</Label><Input type="time" className={inputClass} value={form.end_time} onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))} /></div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
                  <div><Label className="mb-2 block text-slate-800">Rate type</Label><div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">{rateTypes.map((type) => <Button key={type} type="button" variant="ghost" className={cn("h-10 text-slate-600 hover:bg-white hover:text-slate-950", form.rate_type === type && "bg-white text-cyan-700 shadow-sm")} onClick={() => setForm((p) => ({ ...p, rate_type: type }))}>{type}</Button>)}</div></div>
                  <div className="grid gap-2"><Label className="text-slate-800">{form.rate_type} rate (AED) *</Label><Input type="number" min={0} className={cn(inputClass, "font-mono")} value={form.rate_amount} onChange={(e) => setForm((p) => ({ ...p, rate_amount: e.target.value }))} /></div>
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600">{form.rate_type === "Monthly" && form.end_date ? formatMonthlyBillingPeriod(form.start_date, form.end_date) : `${rentalDays} rental day${rentalDays === 1 ? "" : "s"}`}</p>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-cyan-700">Handover, extras & deposit</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2"><Label className="text-slate-800">Initial mileage (km) *</Label><Input type="number" min={0} className={inputClass} value={form.initial_mileage} onChange={(e) => setForm((p) => ({ ...p, initial_mileage: e.target.value }))} /></div>
                  <div className="grid gap-2"><Label className="text-slate-800">Fuel level *</Label><Select value={form.fuel_level} onValueChange={(value) => setForm((p) => ({ ...p, fuel_level: value as FuelLevel }))}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>{fuelLevels.map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="mt-5 space-y-2">{charges.map((charge) => <div key={charge.id} className="grid grid-cols-[1fr_120px_44px] gap-2"><Select value={charge.label} onValueChange={(value) => setCharges((all) => all.map((item) => item.id === charge.id ? { ...item, label: value as ChargeLabel } : item))}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>{chargeLabels.map((label) => <SelectItem key={label} value={label}>{label}</SelectItem>)}</SelectContent></Select><Input type="number" min={0} step="0.01" placeholder="AED" className={cn(inputClass, "font-mono")} value={charge.amount} onChange={(e) => setCharges((all) => all.map((item) => item.id === charge.id ? { ...item, amount: e.target.value } : item))} /><Button type="button" variant="outline" className="h-11 border-slate-300 bg-white text-slate-700" onClick={() => setCharges((all) => all.filter((item) => item.id !== charge.id))}><X className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" className="h-11 border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100" onClick={() => setCharges((all) => [...all, { id: uuid(), label: "Delivery", amount: "" }])}><Plus className="mr-2 h-4 w-4" /> Add charge</Button></div>
                <div className="mt-5 grid gap-4 md:grid-cols-2"><div className="grid gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-4"><Label className="font-bold text-amber-950">Security deposit (AED)</Label><Input type="number" min={0} className={cn(inputClass, "font-mono")} value={form.deposit_amount} onChange={(e) => setForm((p) => ({ ...p, deposit_amount: e.target.value }))} /><p className="text-xs text-amber-800">Deposit is separate from rental payments.</p></div><div className="grid gap-2"><Label className="text-slate-800">Notes</Label><Textarea className="min-h-28 border-slate-300 bg-white text-slate-950" placeholder="Optional internal notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div></div>
              </section>

              <div className="sticky bottom-20 z-10 rounded-xl border border-cyan-300 bg-white p-4 shadow-lg md:bottom-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-sm font-semibold text-slate-600">Contract total</div><div className="font-mono text-3xl font-bold text-slate-950">AED {grandTotal.toLocaleString()}</div><div className="text-xs text-slate-500">Rent AED {rentalTotal.toLocaleString()} + extras AED {extrasTotal.toLocaleString()}</div></div><Button className="h-12 bg-cyan-600 px-7 text-base font-bold text-white hover:bg-cyan-700" disabled={submitting} onClick={createContract}>{submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}{submitting ? "Creating..." : "Create contract & continue"}</Button></div></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5"><div><h2 className="text-2xl font-bold">Vehicle condition</h2><p className="mt-1 text-sm text-slate-600">Add pickup photos before the client signs. Maximum 10.</p></div><section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">{photos.map((photo) => <div key={photo.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={photoPreviews[photo.id]} alt="Pickup inspection" className="aspect-square w-full object-cover" /><button type="button" aria-label="Delete photo" onClick={() => deletePhoto(photo)} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-red-600 shadow"><X className="h-4 w-4" /></button></div>)}</div>{photos.length === 0 && <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center"><ImageIcon className="h-9 w-9 text-blue-600" /><p className="mt-3 font-semibold">No pickup photos yet</p><p className="text-sm text-slate-500">Take clear photos of all sides and existing damage.</p></div>}<input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { uploadPhotos(e.target.files); e.target.value = ""; }} /><input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadPhotos(e.target.files); e.target.value = ""; }} /><div className="mt-5 grid gap-3 sm:grid-cols-2"><Button variant="outline" className="h-12 border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100" disabled={uploading || photos.length >= 10} onClick={() => cameraRef.current?.click()}>{uploading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}Take photo</Button><Button variant="outline" className="h-12 border-slate-300 bg-white text-slate-800" disabled={uploading || photos.length >= 10} onClick={() => galleryRef.current?.click()}><ImageIcon className="mr-2 h-5 w-5" />Choose from gallery</Button></div></section><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="outline" className="h-12 border-slate-300 bg-white text-slate-800" onClick={() => setStep(3)}>Skip photos for now</Button><Button className="h-12 bg-cyan-600 px-7 text-white hover:bg-cyan-700" onClick={() => setStep(3)}>Continue to review</Button></div></div>
          )}

          {step === 3 && (
            <div className="space-y-5"><div><h2 className="text-2xl font-bold">Review & sign</h2><p className="mt-1 text-sm text-slate-600">Check the main details before opening the signature screen.</p></div><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-4 sm:grid-cols-2"><Summary label="Client" value={selectedClient?.full_name || "—"} /><Summary label="Vehicle" value={selectedCar ? `${selectedCar.plate} — ${selectedCar.make} ${selectedCar.model}` : "—"} /><Summary label="Rental period" value={`${form.start_date} ${form.start_time} → ${form.end_date} ${form.end_time}`} /><Summary label="Rate" value={`${form.rate_type} · AED ${Number(form.rate_amount || 0).toLocaleString()}`} /><Summary label="Rental total" value={`AED ${rentalTotal.toLocaleString()}`} /><Summary label="Additional charges" value={`AED ${extrasTotal.toLocaleString()}`} /><Summary label="Deposit held separately" value={`AED ${Number(form.deposit_amount || 0).toLocaleString()}`} accent="amber" /><Summary label="Pickup photos" value={`${photos.length} photo${photos.length === 1 ? "" : "s"}`} /></div><div className="mt-5 rounded-xl bg-blue-50 p-4"><div className="text-sm font-semibold text-blue-800">Contract total</div><div className="font-mono text-3xl font-bold text-blue-950">AED {grandTotal.toLocaleString()}</div></div></section><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button variant="outline" className="h-12 border-slate-300 bg-white text-slate-800" onClick={() => setStep(2)}>Back to photos</Button><Button className="h-12 bg-cyan-600 px-7 text-white hover:bg-cyan-700" onClick={() => setSignOpen(true)}>Open agreement & sign</Button></div><SignContractModal contractId={contractId} clientName={clientName} open={signOpen} onComplete={() => { setSignOpen(false); setStep(4); }} /></div>
          )}

          {step === 4 && (
            <div className="mx-auto max-w-2xl py-12 text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-10 w-10" /></div><h2 className="mt-6 text-3xl font-bold">Contract signed</h2><p className="mt-2 text-slate-600">The contract is active and the vehicle status has been updated.</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><Button variant="outline" className="h-12 border-slate-300 bg-white text-slate-800" onClick={() => navigate(`/contracts/${contractId}`)}>Open contract</Button><Button className="h-12 bg-blue-600 text-white hover:bg-blue-700" onClick={() => navigate("/contracts")}>Back to contracts</Button></div></div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Summary({ label, value, accent }: { label: string; value: string; accent?: "amber" }) {
  return <div className={cn("rounded-xl border p-4", accent === "amber" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50")}><div className={cn("text-xs font-bold uppercase tracking-wide", accent === "amber" ? "text-amber-800" : "text-slate-500")}>{label}</div><div className="mt-1 font-semibold text-slate-950">{value}</div></div>;
}
