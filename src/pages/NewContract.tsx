import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Camera, Check, ChevronRight, Image as ImageIcon, Loader2, Plus, X } from "lucide-react";
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
type MileageUnit = "km" | "mi";
type ChargeLabel = "Delivery" | "Pickup" | "Full Tank" | "Baby Seat" | "Other";
type Step = 1 | 2 | 3 | 4;
type FieldKey = "client_id" | "car_id" | "end_date" | "end_time" | "rate_amount" | "initial_mileage" | "deposit_amount";

interface ClientOption { id: string; full_name: string; license_number: string; license_expiry: string | null; }
interface CarOption { id: string; plate: string; make: string; model: string; status: string; mileage_unit?: MileageUnit | null; }
interface Charge { id: string; label: ChargeLabel; amount: string; }
interface PickupPhoto { id: string; photo_url: string; }

const fuelLevels: Array<{ value: FuelLevel; short: string; label: string }> = [
  { value: "Empty", short: "E", label: "Empty" },
  { value: "Quarter", short: "¼", label: "Quarter" },
  { value: "Half", short: "½", label: "Half" },
  { value: "Three Quarters", short: "¾", label: "Three quarters" },
  { value: "Full", short: "F", label: "Full" },
];
const rateTypes: RateType[] = ["Daily", "Monthly", "Annual"];
const chargeLabels: ChargeLabel[] = ["Delivery", "Pickup", "Full Tank", "Baby Seat", "Other"];
const chargeCategories: Record<ChargeLabel, "delivery" | "pickup" | "fuel" | "other"> = {
  Delivery: "delivery", Pickup: "pickup", "Full Tank": "fuel", "Baby Seat": "other", Other: "other",
};
const stepLabels = ["Contract details", "Vehicle condition", "Review & sign", "Completed"];
const inputClass = "h-11 !border-2 !border-cyan-500 !bg-white !text-slate-950 placeholder:!text-slate-500 shadow-none focus-visible:!border-cyan-600 focus-visible:!ring-2 focus-visible:!ring-cyan-200";
const lightOutlineClass = "border-slate-300 !bg-white !text-slate-800 hover:!bg-slate-50 hover:!text-slate-950";
const errorInputClass = "!border-red-500 focus-visible:!border-red-600 focus-visible:!ring-red-200";

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
function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function NewContract() {
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLDivElement | null>>>({});
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
  const [lastMileage, setLastMileage] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [form, setForm] = useState({
    client_id: "", car_id: "", start_date: todayInput(), start_time: roundedTime(), end_date: "", end_time: roundedTime(),
    rate_type: "Daily" as RateType, rate_amount: "", deposit_amount: "", initial_mileage: "", mileage_unit: "km" as MileageUnit,
    fuel_level: "Full" as FuelLevel, notes: "",
  });

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { toast.error("Please sign in again."); navigate("/auth"); return; }
      setUserId(uid);
      const [clientsRes, carsRes] = await Promise.all([
        supabase.from("clients").select("id, full_name, license_number, license_expiry").eq("owner_id", uid).order("full_name"),
        supabase.from("cars").select("id, plate, make, model, status, mileage_unit").eq("owner_id", uid).order("plate"),
      ]);
      if (clientsRes.error || carsRes.error) toast.error("Could not load clients or vehicles.");
      setClients((clientsRes.data || []) as ClientOption[]);
      setCars((carsRes.data || []) as CarOption[]);
      setLoading(false);
    };
    load();
  }, [navigate]);

  const availableCars = useMemo(() => cars.filter((car) => car.status?.toLowerCase() === "available"), [cars]);
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    return clients.filter((client) =>
      `${client.full_name} ${client.license_number || ""}`.toLowerCase().includes(query),
    );
  }, [clients, clientSearch]);
  const filteredCars = useMemo(() => availableCars.filter((c) => `${c.plate} ${c.make} ${c.model}`.toLowerCase().includes(carSearch.toLowerCase())), [availableCars, carSearch]);
  const selectedClient = clients.find((c) => c.id === form.client_id);
  const selectedCar = availableCars.find((c) => c.id === form.car_id);
  const rentalDays = useMemo(() => {
    const start = parseDateTimeInput(form.start_date, form.start_time);
    const end = parseDateTimeInput(form.end_date, form.end_time);
    if (!start || !end || end <= start) return 0;
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  }, [form.start_date, form.start_time, form.end_date, form.end_time]);
  const rentalTotal = useMemo(() => {
    const rate = Number(form.rate_amount);
    if (!Number.isFinite(rate) || rate <= 0 || rentalDays <= 0) return 0;
    return Math.round(getRateUnits(rentalDays, form.rate_type, form.start_date, form.end_date) * rate);
  }, [form.rate_amount, form.rate_type, form.start_date, form.end_date, rentalDays]);
  const extrasTotal = useMemo(() => charges.reduce((sum, c) => sum + (Number(c.amount) > 0 ? Number(c.amount) : 0), 0), [charges]);
  const grandTotal = rentalTotal + extrasTotal;

  const clientWarning = useMemo(() => {
    if (!selectedClient) return "";
    const hasNumber = Boolean(selectedClient.license_number?.trim());
    const hasExpiry = Boolean(selectedClient.license_expiry);
    if (!hasNumber && !hasExpiry) return "Driving licence number and expiry date are missing.";
    if (!hasNumber) return "Driving licence number is missing.";
    if (!hasExpiry) return "Driving licence expiry date is missing.";
    const expiry = new Date(`${selectedClient.license_expiry}T23:59:59`);
    const start = parseDateTimeInput(form.start_date, form.start_time);
    const end = parseDateTimeInput(form.end_date, form.end_time);
    if (start && expiry < start) return `Driving licence expired on ${formatDate(selectedClient.license_expiry)}.`;
    if (end && expiry < end) return `Driving licence expires during this rental on ${formatDate(selectedClient.license_expiry)}.`;
    return "";
  }, [selectedClient, form.start_date, form.start_time, form.end_date, form.end_time]);

  const clearError = (field: FieldKey) => setFieldErrors((current) => ({ ...current, [field]: undefined }));
  const setField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field in fieldErrors) clearError(field as FieldKey);
  };

  const prefillMileage = async (car: CarOption) => {
    const unit = car.mileage_unit === "mi" ? "mi" : "km";
    setLastMileage(null);
    setForm((p) => ({ ...p, car_id: car.id, initial_mileage: "", mileage_unit: unit }));
    clearError("car_id");
    const { data } = await (supabase as any).from("car_maintenance").select("current_mileage").eq("car_id", car.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.current_mileage != null) {
      setLastMileage(Number(data.current_mileage));
      setForm((p) => ({ ...p, initial_mileage: String(data.current_mileage) }));
    }
  };

  const changeMileageUnit = () => {
    if (!form.car_id) return;
    const next: MileageUnit = form.mileage_unit === "km" ? "mi" : "km";
    const accepted = window.confirm(`Change this vehicle's mileage unit from ${form.mileage_unit.toUpperCase()} to ${next.toUpperCase()}? Existing numbers will not be converted.`);
    if (!accepted) return;
    setField("mileage_unit", next);
    toast.info(`Vehicle mileage unit changed to ${next.toUpperCase()}.`);
  };

  const validate = () => {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!form.client_id) errors.client_id = "Select a client.";
    if (!form.car_id) errors.car_id = "Select a vehicle.";
    if (!form.end_date) errors.end_date = "Select the return date.";
    if (form.end_date && rentalDays <= 0) errors.end_time = "Return date and time must be after pickup.";
    if (!(Number(form.rate_amount) > 0)) errors.rate_amount = "Enter a valid rental rate.";
    if (form.initial_mileage === "" || Number(form.initial_mileage) < 0) errors.initial_mileage = "Enter valid initial mileage.";
    if (form.deposit_amount !== "" && Number(form.deposit_amount) < 0) errors.deposit_amount = "Enter a valid deposit.";
    setFieldErrors(errors);
    const first = Object.keys(errors)[0] as FieldKey | undefined;
    if (first) {
      requestAnimationFrame(() => fieldRefs.current[first]?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return false;
    }
    return true;
  };

  const createContract = async () => {
    if (!validate()) { toast.error("Check the highlighted fields."); return; }
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
        initial_mileage: Number(form.initial_mileage), mileage_unit: form.mileage_unit, fuel_level: form.fuel_level,
        status: "Draft", payment_status: "Unpaid", notes: form.notes.trim() || null, owner_id: userId,
      } as any);
      if (error) throw error;
      await supabase.from("cars").update({ mileage_unit: form.mileage_unit } as any).eq("id", form.car_id).eq("owner_id", userId);
      setCars((current) => current.map((car) => car.id === form.car_id ? { ...car, mileage_unit: form.mileage_unit } : car));
      try { await saveContractDrivers(id, userId, additionalDriverIds); }
      catch (driverError) { await supabase.from("contracts").delete().eq("id", id); throw driverError; }
      const validCharges = charges.filter((c) => c.label && Number(c.amount) > 0);
      if (validCharges.length) {
        const { error: feeError } = await (supabase as any).from("contract_fees").insert(validCharges.map((c) => ({
          contract_id: id, category: chargeCategories[c.label], label: c.label, amount: Number(c.amount), owner_id: userId,
        })));
        if (feeError) toast.error("Draft created, but additional charges could not be saved.");
      }
      setContractId(id);
      setClientName(selectedClient?.full_name || "Client");
      setStep(2);
      toast.success("Contract draft created");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create contract draft."); }
    finally { setSubmitting(false); }
  };

  const activateSignedContract = async () => {
    const { error } = await supabase.from("contracts").update({ status: "Active" }).eq("id", contractId).eq("owner_id", userId);
    if (error) { toast.error("Signatures were saved, but the contract could not be activated."); return false; }
    try {
      await syncVehicleStatusesWithContracts();
    } catch {
      toast.error("Contract activated, but the vehicle status could not be updated. Please try again.");
      return false;
    }
    return true;
  };

  const finishSignedContract = () => {
    setSignOpen(false);
    setStep(4);
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

  const FieldError = ({ field }: { field: FieldKey }) => fieldErrors[field] ? <p className="text-xs font-medium text-red-600">{fieldErrors[field]}</p> : null;

  if (loading) return <DashboardLayout title="New Contract"><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div></DashboardLayout>;

  return (
    <DashboardLayout title="New Contract" subtitle="Create, inspect and sign" mobileContractsNav>
      <div className="-mx-4 -my-6 min-h-[calc(100dvh-3.5rem)] bg-[#f5f7f9] text-slate-950 md:-mx-8 md:-my-8">
        <div className="sticky top-0 z-20 border-b border-cyan-700 bg-cyan-600 text-white shadow-sm">
          <div className="mx-auto max-w-5xl px-4 py-4 md:px-8">
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" className="h-11 px-2 text-white hover:bg-white/15 hover:text-white" onClick={() => navigate("/contracts")}><ArrowLeft className="mr-2 h-4 w-4" /> Contracts</Button>
              <span className="text-sm font-bold text-white">{step}/4</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">{stepLabels.map((label, index) => <div key={label}><div className={cn("h-2 rounded-full", index + 1 <= step ? "bg-white" : "bg-white/35")} /><div className={cn("mt-1 hidden text-[11px] font-semibold md:block", index + 1 === step ? "text-white" : "text-white/75")}>{label}</div></div>)}</div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-3 py-4 md:px-8 md:py-8">
          {step === 1 && (
            <div className="space-y-4">
              <div><h2 className="text-2xl font-bold">Contract details</h2><p className="mt-1 text-sm text-slate-600">Complete the rental details. The contract becomes active only after all signatures.</p></div>

              <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-cyan-700">Client & vehicle</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div ref={(node) => { fieldRefs.current.client_id = node; }} className="grid gap-2"><Label>Main client *</Label><Popover open={clientOpen} onOpenChange={(open) => { setClientOpen(open); if (!open) setClientSearch(""); }}><PopoverTrigger asChild><Button variant="outline" className={cn("h-11 justify-between !border-2 !bg-white !text-slate-950", fieldErrors.client_id ? "!border-red-500" : "!border-cyan-500")}>{selectedClient?.full_name || "Select client"}<ChevronRight className="h-4 w-4 text-slate-400" /></Button></PopoverTrigger><PopoverContent className="z-[100] w-[var(--radix-popover-trigger-width)] !border-2 !border-cyan-500 !bg-white p-0 !text-slate-950"><Command shouldFilter={false} className="!bg-white !text-slate-950"><CommandInput className="!text-slate-950 placeholder:!text-slate-500" placeholder="Search client" value={clientSearch} onValueChange={setClientSearch} /><CommandList className="!bg-white"><CommandEmpty className="!text-slate-500">No client found.</CommandEmpty><CommandGroup className="!text-slate-950">{filteredClients.map((client) => <CommandItem className="!text-slate-950 data-[selected=true]:!bg-cyan-50 data-[selected=true]:!text-slate-950" key={client.id} value={`${client.full_name} ${client.license_number || ""}`} onSelect={() => { setField("client_id", client.id); setAdditionalDriverIds((ids) => ids.filter((id) => id !== client.id)); setClientOpen(false); setClientSearch(""); }}><Check className={cn("mr-2 h-4 w-4", form.client_id === client.id ? "opacity-100" : "opacity-0")} />{client.full_name}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover><FieldError field="client_id" />{clientWarning && <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{clientWarning}</span></div>}</div>
                  <div ref={(node) => { fieldRefs.current.car_id = node; }} className="grid gap-2"><Label>Vehicle *</Label><Popover open={carOpen} onOpenChange={(open) => { setCarOpen(open); if (!open) setCarSearch(""); }}><PopoverTrigger asChild><Button variant="outline" className={cn("h-11 justify-between !border-2 !bg-white !text-slate-950", fieldErrors.car_id ? "!border-red-500" : "!border-cyan-500")}>{selectedCar ? `${selectedCar.plate} — ${selectedCar.make} ${selectedCar.model}` : "Select available vehicle"}<ChevronRight className="h-4 w-4 text-slate-400" /></Button></PopoverTrigger><PopoverContent className="z-[100] w-[var(--radix-popover-trigger-width)] !border-2 !border-cyan-500 !bg-white p-0 !text-slate-950"><Command shouldFilter={false} className="!bg-white !text-slate-950"><CommandInput className="!text-slate-950 placeholder:!text-slate-500" placeholder="Search plate or model" value={carSearch} onValueChange={setCarSearch} /><CommandList className="!bg-white"><CommandEmpty className="!text-slate-500">No available vehicle found.</CommandEmpty><CommandGroup className="!text-slate-950">{filteredCars.map((car) => <CommandItem className="!text-slate-950 data-[selected=true]:!bg-cyan-50 data-[selected=true]:!text-slate-950" key={car.id} value={`${car.plate} ${car.make} ${car.model}`} onSelect={() => { prefillMileage(car); setCarOpen(false); setCarSearch(""); }}><Check className={cn("mr-2 h-4 w-4", form.car_id === car.id ? "opacity-100" : "opacity-0")} />{car.plate} — {car.make} {car.model}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover><FieldError field="car_id" /></div>
                </div>
                <div className="mt-4"><AdditionalDriversField clients={clients} primaryClientId={form.client_id} value={additionalDriverIds} onChange={setAdditionalDriverIds} /></div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-cyan-700">Rental period & rate</h3>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>Start date *</Label><Input type="date" className={inputClass} value={form.start_date} onChange={(e) => setField("start_date", e.target.value)} /></div><div ref={(node) => { fieldRefs.current.end_date = node; }} className="grid gap-2"><Label>End date *</Label><Input type="date" className={cn(inputClass, fieldErrors.end_date && errorInputClass)} value={form.end_date} onChange={(e) => setField("end_date", e.target.value)} /><FieldError field="end_date" /></div></div>
                  <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>Start time *</Label><Input type="time" className={inputClass} value={form.start_time} onChange={(e) => setField("start_time", e.target.value)} /></div><div ref={(node) => { fieldRefs.current.end_time = node; }} className="grid gap-2"><Label>End time *</Label><Input type="time" className={cn(inputClass, fieldErrors.end_time && errorInputClass)} value={form.end_time} onChange={(e) => setField("end_time", e.target.value)} /><FieldError field="end_time" /></div></div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2"><div><Label className="mb-2 block">Rate type</Label><div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">{rateTypes.map((type) => <Button key={type} type="button" variant="ghost" className={cn("h-10 text-slate-600", form.rate_type === type && "bg-white text-cyan-700 shadow-sm")} onClick={() => setField("rate_type", type)}>{type}</Button>)}</div></div><div ref={(node) => { fieldRefs.current.rate_amount = node; }} className="grid gap-2"><Label>{form.rate_type} rate (AED) *</Label><Input type="number" min={0} className={cn(inputClass, fieldErrors.rate_amount && errorInputClass)} value={form.rate_amount} onChange={(e) => setField("rate_amount", e.target.value)} /><FieldError field="rate_amount" /></div></div>
                <p className="mt-3 text-sm font-medium text-slate-600">{form.rate_type === "Monthly" && form.end_date ? formatMonthlyBillingPeriod(form.start_date, form.end_date) : `${rentalDays} rental day${rentalDays === 1 ? "" : "s"}`}</p>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-cyan-700">Handover, extras & deposit</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div ref={(node) => { fieldRefs.current.initial_mileage = node; }} className="grid gap-2">
                    <div className="flex items-center justify-between gap-3"><Label>Initial mileage *</Label><div className="flex items-center gap-2"><span className="rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-bold uppercase text-cyan-800">{form.mileage_unit}</span><button type="button" disabled={!form.car_id} onClick={changeMileageUnit} className="text-xs font-semibold text-cyan-700 underline-offset-2 hover:underline disabled:text-slate-400">Change</button></div></div>
                    <Input type="number" min={0} className={cn(inputClass, fieldErrors.initial_mileage && errorInputClass)} value={form.initial_mileage} onChange={(e) => setField("initial_mileage", e.target.value)} />
                    <FieldError field="initial_mileage" />
                    {lastMileage != null && <p className="text-xs text-slate-600">Last recorded: {lastMileage.toLocaleString()} {form.mileage_unit}</p>}
                    {lastMileage != null && Number(form.initial_mileage) < lastMileage && <p className="flex items-center gap-1 text-xs font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Entered mileage is below the last recorded value.</p>}
                  </div>
                  <div className="grid gap-2"><Label>Fuel level *</Label><div className="grid grid-cols-5 overflow-hidden rounded-xl border-2 border-cyan-500 bg-white" role="radiogroup" aria-label="Fuel level">{fuelLevels.map((level, index) => { const selectedIndex = fuelLevels.findIndex((item) => item.value === form.fuel_level); const active = index <= selectedIndex; return <button key={level.value} type="button" role="radio" aria-checked={form.fuel_level === level.value} aria-label={level.label} onClick={() => setField("fuel_level", level.value)} className={cn("h-11 border-r border-cyan-200 text-sm font-bold last:border-r-0", active ? "bg-cyan-600 text-white" : "bg-white text-slate-500")}>{level.short}</button>; })}</div><p className="text-xs font-medium text-slate-600">Selected: {fuelLevels.find((item) => item.value === form.fuel_level)?.label}</p></div>
                </div>
                <div className="mt-5 space-y-2">{charges.map((charge) => <div key={charge.id} className="grid grid-cols-[1fr_120px_44px] gap-2"><Select value={charge.label} onValueChange={(value) => setCharges((all) => all.map((item) => item.id === charge.id ? { ...item, label: value as ChargeLabel } : item))}><SelectTrigger className={inputClass}><SelectValue /></SelectTrigger><SelectContent>{chargeLabels.map((label) => <SelectItem key={label} value={label}>{label}</SelectItem>)}</SelectContent></Select><Input type="number" min={0} step="0.01" placeholder="AED" className={inputClass} value={charge.amount} onChange={(e) => setCharges((all) => all.map((item) => item.id === charge.id ? { ...item, amount: e.target.value } : item))} /><Button type="button" variant="outline" className={cn("h-11", lightOutlineClass)} onClick={() => setCharges((all) => all.filter((item) => item.id !== charge.id))}><X className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" className="h-11 border-cyan-300 !bg-cyan-50 !text-cyan-700 hover:!bg-cyan-100" onClick={() => setCharges((all) => [...all, { id: uuid(), label: "Delivery", amount: "" }])}><Plus className="mr-2 h-4 w-4" /> Add charge</Button></div>
                <div className="mt-5 grid gap-4 md:grid-cols-2"><div ref={(node) => { fieldRefs.current.deposit_amount = node; }} className="grid gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-4"><Label className="font-bold text-amber-950">Security deposit (AED)</Label><Input type="number" min={0} className={cn(inputClass, fieldErrors.deposit_amount && errorInputClass)} value={form.deposit_amount} onChange={(e) => setField("deposit_amount", e.target.value)} /><FieldError field="deposit_amount" /><p className="text-xs text-amber-800">Deposit is separate from rental payments.</p></div><div className="grid gap-2"><Label>Notes</Label><Textarea className="min-h-28 !border-slate-300 !bg-white !text-slate-950 placeholder:!text-slate-500" placeholder="Optional internal notes" value={form.notes} onChange={(e) => setField("notes", e.target.value)} /></div></div>
              </section>

              <div className="rounded-xl border border-cyan-300 bg-white p-4 shadow-lg md:sticky md:bottom-4 md:z-10"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-sm font-semibold text-slate-600">Contract total</div><div className="font-mono text-3xl font-bold">AED {grandTotal.toLocaleString()}</div><div className="text-xs text-slate-500">Rent AED {rentalTotal.toLocaleString()} + extras AED {extrasTotal.toLocaleString()}</div></div><Button className="h-12 bg-cyan-600 px-7 text-base font-bold text-white hover:bg-cyan-700" disabled={submitting} onClick={createContract}>{submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}{submitting ? "Creating..." : "Create draft & continue"}</Button></div></div>
            </div>
          )}

          {step === 2 && <div className="space-y-4"><div><h2 className="text-2xl font-bold">Vehicle condition</h2><p className="mt-1 text-sm text-slate-600">Add pickup photos before the client signs. Maximum 10.</p></div><section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">{photos.map((photo) => <div key={photo.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={photoPreviews[photo.id]} alt="Pickup inspection" className="aspect-square w-full object-cover" /><button type="button" aria-label="Delete photo" onClick={() => deletePhoto(photo)} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-red-600 shadow"><X className="h-4 w-4" /></button></div>)}</div>{photos.length === 0 && <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center"><ImageIcon className="h-9 w-9 text-cyan-600" /><p className="mt-3 font-semibold">No pickup photos yet</p><p className="text-sm text-slate-500">Take clear photos of all sides and existing damage.</p></div>}<input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { uploadPhotos(e.target.files); e.target.value = ""; }} /><input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadPhotos(e.target.files); e.target.value = ""; }} /><div className="mt-5 grid gap-3 sm:grid-cols-2"><Button variant="outline" className="h-12 border-cyan-300 !bg-cyan-50 !text-cyan-700 hover:!bg-cyan-100" disabled={uploading || photos.length >= 10} onClick={() => cameraRef.current?.click()}>{uploading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}Take photo</Button><Button variant="outline" className={cn("h-12", lightOutlineClass)} disabled={uploading || photos.length >= 10} onClick={() => galleryRef.current?.click()}><ImageIcon className="mr-2 h-5 w-5" />Choose from gallery</Button></div></section><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="outline" className={cn("h-12", lightOutlineClass)} onClick={() => setStep(3)}>Skip photos for now</Button><Button className="h-12 bg-cyan-600 px-7 text-white" onClick={() => setStep(3)}>Continue to review</Button></div></div>}

          {step === 3 && <div className="space-y-4"><div><h2 className="text-2xl font-bold">Review & sign</h2><p className="mt-1 text-sm text-slate-600">The draft becomes active after every required signature is saved.</p></div><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="grid grid-cols-2 gap-2.5 sm:gap-3"><Summary label="Client" value={selectedClient?.full_name || "—"} wide /><Summary label="Vehicle" value={selectedCar ? `${selectedCar.plate} — ${selectedCar.make} ${selectedCar.model}` : "—"} wide /><Summary label="Rental period" value={`${form.start_date} ${form.start_time} → ${form.end_date} ${form.end_time}`} wide /><Summary label="Rate" value={`${form.rate_type} · AED ${Number(form.rate_amount || 0).toLocaleString()}`} /><Summary label="Initial mileage" value={`${Number(form.initial_mileage || 0).toLocaleString()} ${form.mileage_unit}`} /><Summary label="Fuel" value={form.fuel_level} /><Summary label="Rental total" value={`AED ${rentalTotal.toLocaleString()}`} /><Summary label="Additional charges" value={`AED ${extrasTotal.toLocaleString()}`} /><Summary label="Deposit held separately" value={`AED ${Number(form.deposit_amount || 0).toLocaleString()}`} accent="amber" /><Summary label="Pickup photos" value={`${photos.length} photo${photos.length === 1 ? "" : "s"}`} /></div><div className="mt-3 rounded-xl bg-cyan-50 p-3.5"><div className="text-xs font-semibold text-cyan-800">Contract total</div><div className="font-mono text-2xl font-bold text-cyan-950">AED {grandTotal.toLocaleString()}</div></div></section><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button variant="outline" className={cn("h-12", lightOutlineClass)} onClick={() => setStep(2)}>Back to photos</Button><Button className="h-12 bg-cyan-600 px-7 text-white" onClick={() => setSignOpen(true)}>Open agreement & sign</Button></div><SignContractModal contractId={contractId} clientName={clientName} open={signOpen} onActivate={activateSignedContract} onComplete={finishSignedContract} /></div>}

          {step === 4 && <div className="mx-auto max-w-2xl py-12 text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-10 w-10" /></div><h2 className="mt-6 text-3xl font-bold">Contract signed</h2><p className="mt-2 text-slate-600">The contract is active and the vehicle status has been updated.</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><Button variant="outline" className={cn("h-12", lightOutlineClass)} onClick={() => navigate(`/contracts/${contractId}`)}>Open contract</Button><Button className="h-12 bg-cyan-600 text-white" onClick={() => navigate("/contracts")}>Back to contracts</Button></div></div>}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Summary({ label, value, accent, wide }: { label: string; value: string; accent?: "amber"; wide?: boolean }) {
  return <div className={cn("min-w-0 rounded-xl border p-3", wide && "col-span-2", accent === "amber" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50")}><div className={cn("text-[10px] font-bold uppercase tracking-wide", accent === "amber" ? "text-amber-800" : "text-slate-500")}>{label}</div><div className="mt-1 break-words text-sm font-semibold leading-snug text-slate-950">{value}</div></div>;
}
