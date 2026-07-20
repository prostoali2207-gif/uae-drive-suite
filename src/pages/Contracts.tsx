import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText, Check, ChevronsUpDown, ArrowUp, ArrowDown, Trash2, RotateCcw, Camera, Image as ImageIcon, Loader2, Search, X } from "lucide-react";
import { generateContractPdf } from "@/lib/contractPdf";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { syncVehicleStatusesWithContracts } from "@/lib/vehicleStatusSync";
import { findVehicleContractOverlap, formatContractOverlapMessage } from "@/lib/contractOverlap";
import { formatMonthlyBillingPeriod, getRateUnits } from "@/lib/contractPricing";
import { diffCalendarDays, parseDateInput, parseDateTimeInput } from "@/lib/dateUtils";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";
import { toast } from "sonner";
import { SignContractModal } from "@/components/SignContractModal";
import { AdditionalDriversField } from "@/components/AdditionalDriversField";
import { saveContractDrivers } from "@/lib/contractDrivers";
import { ListPagination, getPaginatedRows } from "@/components/ListPagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const supabaseClient = supabase;

type ContractFilter = "All" | "Active" | "Overdue" | "Closed";
type DepositFilter = "All" | "Held" | "Returned" | "No deposit";
type DashboardContractFilter = "returns-today" | "overdue" | "unpaid" | "deposits-ready";
type PaymentStatus = "Paid" | "Partial" | "Unpaid";
type FuelLevel = "Empty" | "Quarter" | "Half" | "Three Quarters" | "Full";
type RateType = "Daily" | "Monthly" | "Annual";
type AdditionalChargeLabel = "Delivery" | "Pickup" | "Full Tank" | "Baby Seat" | "Other";

interface AdditionalCharge {
  id: string;
  label: AdditionalChargeLabel;
  amount: string;
}

interface ContractRow {
  id: string;
  client_id: string;
  car_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  deposit_returned: string | null;
  deposit_status?: string | null;
  initial_mileage: number;
  fuel_level: string;
  status: string;
  payment_status: string;
  balance_due?: number;
  effective_end_date?: string;
  client_signature?: string | null;
  manager_signature?: string | null;
  clients: { full_name: string; phone: string; nationality: string; client_type: string; emirates_id: string | null; passport_number: string | null; license_number: string | null } | null;
  cars: { plate: string; make: string; model: string; year: number; color: string | null } | null;
}

interface ClientOption {
  id: string;
  full_name: string;
  license_number: string;
  license_expiry: string | null;
}
interface CarOption { id: string; plate: string; make: string; model: string; status: string; }
type VehicleAvailability =
  | { status: "available" }
  | { status: "conflict"; conflict: Awaited<ReturnType<typeof findVehicleContractOverlap>> }
  | { status: "checking" }
  | { status: "error"; message: string };

function toSupabaseMessage(error: { code?: string; message?: string } | null): string {
  if (error?.code === "PGRST205") {
    return "Supabase tables are missing in this project. Run migrations, then retry.";
  }
  return error?.message || "unknown error";
}

const statusClasses: Record<string, string> = {
  Active: "bg-tint-green text-tint-green-foreground",
  "Expiring Soon": "bg-tint-amber text-tint-amber-foreground",
  Overdue: "bg-tint-rose text-tint-rose-foreground",
  Completed: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
  Closed: "bg-muted text-muted-foreground",
  returned: "bg-muted text-muted-foreground",
  Returned: "bg-muted text-muted-foreground",
};

const paymentClasses: Record<string, string> = {
  Paid: "bg-tint-green text-tint-green-foreground",
  Partial: "bg-tint-amber text-tint-amber-foreground",
  Unpaid: "bg-tint-rose text-tint-rose-foreground",
};

const desktopFilters: ContractFilter[] = ["All", "Active", "Overdue", "Closed"];
const mobileFilterOrder: ContractFilter[] = ["All", "Active", "Overdue", "Closed"];
const depositFilters: DepositFilter[] = ["All", "Held", "Returned", "No deposit"];
const dashboardContractFilterLabels: Record<DashboardContractFilter, string> = {
  "returns-today": "returns today",
  overdue: "overdue returns",
  unpaid: "unpaid balances",
  "deposits-ready": "deposits ready to return",
};
const fuelLevels: FuelLevel[] = ["Empty", "Quarter", "Half", "Three Quarters", "Full"];
const rateTypes: RateType[] = ["Daily", "Monthly", "Annual"];
const additionalChargeLabels: AdditionalChargeLabel[] = ["Delivery", "Pickup", "Full Tank", "Baby Seat", "Other"];
const additionalChargeCategories: Record<AdditionalChargeLabel, "delivery" | "pickup" | "fuel" | "other"> = {
  Delivery: "delivery",
  Pickup: "pickup",
  "Full Tank": "fuel",
  "Baby Seat": "other",
  Other: "other",
};
const rateLabels: Record<RateType, string> = {
  Daily: "Daily Rate (AED per day)",
  Monthly: "Monthly Rate (AED per month)",
  Annual: "Annual Rate (AED per year)",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMobileDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getDaysUntilExpiry(iso: string): number {
  const end = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

function getContractEndDateTime(contract: ContractRow): Date | null {
  const time = formatTimeDisplay(contract.end_time) || "23:59";
  return parseDateTimeInput(getEffectiveContractEndDate(contract), time);
}

function getEffectiveContractEndDate(contract: Pick<ContractRow, "end_date" | "effective_end_date">): string {
  return contract.effective_end_date || contract.end_date;
}

function isOverdueContract(contract: ContractRow): boolean {
  if (contract.status.trim().toLowerCase() !== "active") return false;
  const end = getContractEndDateTime(contract);
  return Boolean(end && end.getTime() < Date.now());
}

function getContractStatusLabel(contract: ContractRow): "Active" | "Overdue" | "Closed" | string {
  if (isClosedContract(contract.status)) return "Closed";
  if (isOverdueContract(contract)) return "Overdue";
  return contract.status.trim().toLowerCase() === "active" ? "Active" : contract.status;
}

function getDepositState(contract: ContractRow): DepositFilter {
  const depositAmount = Number(contract.deposit_amount || 0);
  if (depositAmount <= 0) return "No deposit";
  const status = String(contract.deposit_status ?? "").trim().toLowerCase();
  if (status === "returned") return "Returned";
  return "Held";
}

function matchesContractFilter(contract: ContractRow, selectedFilter: ContractFilter): boolean {
  if (selectedFilter === "All") return true;
  if (selectedFilter === "Closed") {
    return isClosedContract(contract.status);
  }
  if (selectedFilter === "Overdue") return isOverdueContract(contract);
  return getContractStatusLabel(contract) === selectedFilter;
}

function matchesDepositFilter(contract: ContractRow, selectedFilter: DepositFilter): boolean {
  if (selectedFilter === "All") return true;
  return getDepositState(contract) === selectedFilter;
}

function isClosedContract(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "closed" || normalized === "completed" || normalized === "returned";
}

function isOngoingContract(contract: ContractRow): boolean {
  const status = contract.status.trim().toLowerCase();
  return status === "active" || status === "expiring soon";
}

function matchesDashboardContractFilter(
  contract: ContractRow,
  selectedFilter: DashboardContractFilter | null,
  depositReadyCutoff: string,
): boolean {
  if (!selectedFilter) return true;
  if (selectedFilter === "returns-today") {
    return contract.status.trim().toLowerCase() === "active" && getEffectiveContractEndDate(contract) === getTodayDateInput();
  }
  if (selectedFilter === "overdue") {
    return isOverdueContract(contract);
  }
  if (selectedFilter === "unpaid") {
    return isOngoingContract(contract) && Number(contract.balance_due || 0) > 0;
  }
  return (
    isClosedContract(contract.status) &&
    Number(contract.deposit_amount || 0) > 0 &&
    contract.deposit_returned === null &&
    getDepositState(contract) !== "Returned" &&
    getEffectiveContractEndDate(contract) <= depositReadyCutoff
  );
}

function getMobileCardStatus(contract: ContractRow): { label: string; className: string; isClosed: boolean } {
  if (isClosedContract(contract.status)) {
    return { label: "Closed", className: "bg-muted text-muted-foreground", isClosed: true };
  }

  if (isOverdueContract(contract)) {
    return { label: "Overdue", className: "bg-tint-rose text-tint-rose-foreground", isClosed: false };
  }
  const daysUntilExpiry = getDaysUntilExpiry(getEffectiveContractEndDate(contract));
  if (daysUntilExpiry === 0) {
    return { label: "Today", className: "bg-tint-amber text-tint-amber-foreground", isClosed: false };
  }

  return { label: "Active", className: "bg-tint-green text-tint-green-foreground", isClosed: false };
}

function getRoundedCurrentTimeInput(): string {
  const now = new Date();
  const hasPartialMinute = now.getSeconds() > 0 || now.getMilliseconds() > 0;
  const minutes = now.getHours() * 60 + now.getMinutes() + (hasPartialMinute ? 1 : 0);
  const roundedMinutes = Math.ceil(minutes / 5) * 5;
  const hours = Math.floor(roundedMinutes / 60) % 24;
  const mins = roundedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function getTodayDateInput(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function getDepositReadyCutoff(days: number): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString().split("T")[0];
}

function getDashboardContractFilter(value: string | null): DashboardContractFilter | null {
  if (
    value === "returns-today" ||
    value === "overdue" ||
    value === "unpaid" ||
    value === "deposits-ready"
  ) {
    return value;
  }
  return null;
}

function formatTimeForDb(time: string | undefined): string {
  if (time == null || time.trim() === "") return `${getRoundedCurrentTimeInput()}:00`;
  const trimmed = time.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return `${getRoundedCurrentTimeInput()}:00`;
}

function formatTimeDisplay(time: string | null | undefined): string {
  if (!time) return "";
  const match = time.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function formatDateWithTime(date: string, time?: string | null) {
  const dateStr = formatDate(date);
  const timeStr = formatTimeDisplay(time);
  if (!timeStr) return dateStr;
  return (
    <>
      {dateStr} · <span className="font-mono">{timeStr}</span>
    </>
  );
}

function diffDays(start: string, end: string): number {
  return diffCalendarDays(start, end);
}

function formatRateSummary(
  days: number,
  rateAmount: string,
  rateType: RateType,
  rentalTotal: number,
  extrasTotal: number,
  startDate: string,
  endDate: string,
): string {
  const rate = Number(rateAmount);
  const safeRate = Number.isFinite(rate) ? rate : 0;
  const grandTotal = rentalTotal + extrasTotal;

  if (rateType === "Monthly") {
    const period = formatMonthlyBillingPeriod(startDate, endDate);
    if (extrasTotal > 0) {
      return `${period} · Monthly total + AED ${extrasTotal.toLocaleString()} extras = AED ${grandTotal.toLocaleString()}`;
    }
    return `${period} · Monthly total`;
  }

  if (rateType === "Annual") {
    return `${getRateUnits(days, rateType, startDate, endDate).toFixed(2)} years × ${safeRate.toLocaleString()} AED + ${extrasTotal.toLocaleString()} AED extras = AED ${grandTotal.toLocaleString()}`;
  }

  return `${days} days × ${safeRate.toLocaleString()} AED + ${extrasTotal.toLocaleString()} AED extras = AED ${grandTotal.toLocaleString()}`;
}

function getContractDateTime(date: string, time: string): Date | null {
  if (!date || !time || !/^\d{2}:\d{2}$/.test(time)) return null;
  return parseDateTimeInput(date, time);
}

function getBillingDays(startDate: string, startTime: string, endDate: string, endTime: string): number {
  const start = getContractDateTime(startDate, startTime);
  const end = getContractDateTime(endDate, endTime);
  if (!start || !end || end <= start) return 0;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function createContractId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function isAtLeastFullMonth(start: string, end: string): boolean {
  if (!start || !end) return false;
  const s = parseDateInput(start);
  const e = parseDateInput(end);
  if (!s || !e) return false;
  const oneMonthLater = new Date(s);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  if (e.getTime() >= oneMonthLater.getTime()) return true;

  const isSameMonth =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth();
  const lastDayOfMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
  const isWholeCalendarMonth = isSameMonth && s.getDate() === 1 && e.getDate() === lastDayOfMonth;
  return isWholeCalendarMonth;
}

const createEmptyForm = () => ({
  client_id: "",
  car_id: "",
  start_date: getTodayDateInput(),
  start_time: "",
  end_date: "",
  end_time: "",
  rate_type: "Daily" as RateType,
  rate_amount: "0",
  deposit_amount: "0",
  initial_mileage: "",
  fuel_level: "Full" as FuelLevel,
  special_conditions: "",
  notes: "",
});

const PICKUP_PHOTO_MAX = 10;

interface PickupPhoto {
  id: string;
  slot: string;
  photo_url: string;
  uploaded_at: string | null;
}

interface PickupInspectionModalProps {
  contractId: string;
  uploadedBy: string | null;
  open: boolean;
  onContinue: () => void;
}

function PickupInspectionModal({ contractId, uploadedBy, open, onContinue }: PickupInspectionModalProps) {
  const [photos, setPhotos] = useState<PickupPhoto[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const photoCount = photos.length;
  const progressValue = (photoCount / PICKUP_PHOTO_MAX) * 100;
  const atLimit = photoCount >= PICKUP_PHOTO_MAX;

  const refreshPhotos = useCallback(async () => {
    if (!contractId) return;
    const { data, error } = await (supabase as any)
      .from("contract_inspections")
      .select("id, slot, photo_url, uploaded_at")
      .eq("contract_id", contractId)
      .eq("type", "pickup")
      .order("uploaded_at", { ascending: true });

    if (error) {
      setErrors((prev) => ({ ...prev, load: "Could not load pickup photos." }));
      return;
    }
    setPhotos((data ?? []) as PickupPhoto[]);
    setErrors((prev) => ({ ...prev, load: "" }));
  }, [contractId]);

  useEffect(() => {
    if (!open) return;
    refreshPhotos();
  }, [open, refreshPhotos]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadPreviews = async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        photos.map(async (photo) => {
          if (!photo.photo_url) return;
          if (/^(https?:|data:|blob:)/.test(photo.photo_url)) {
            next[photo.id] = photo.photo_url;
            return;
          }
          const { data } = supabase.storage.from("inspection-photos").getPublicUrl(photo.photo_url);
          if (data?.publicUrl) next[photo.id] = data.publicUrl;
        }),
      );
      if (!cancelled) setPreviews(next);
    };
    loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [photos, open]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const availableSlots = PICKUP_PHOTO_MAX - photoCount;
    if (availableSlots <= 0) return;

    const filesToUpload = Array.from(files).slice(0, availableSlots);
    setUploading(true);
    setErrors((prev) => ({ ...prev, upload: "" }));

    for (const file of filesToUpload) {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${contractId}/pickup/${uniqueId}.jpg`;
      const uploadFile = await prepareImageForStorageUpload(file);
      logImageCompressionUpload("Contracts", file, uploadFile, path);

      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(path, uploadFile, {
          contentType: uploadFile.type || "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        setErrors((prev) => ({ ...prev, upload: uploadError.message }));
        continue;
      }

      const payload = {
        contract_id: contractId,
        type: "pickup",
        slot: uniqueId,
        photo_url: path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploadedBy,
      };

      const { error: saveError } = await (supabase as any).from("contract_inspections").insert(payload);
      if (saveError) {
        setErrors((prev) => ({ ...prev, upload: saveError.message }));
      }
    }

    setUploading(false);
    await refreshPhotos();
  };

  const deletePhoto = async (photo: PickupPhoto) => {
    await supabase.storage.from("inspection-photos").remove([photo.photo_url]);
    await (supabase as any).from("contract_inspections").delete().eq("id", photo.id);
    await refreshPhotos();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onContinue(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-[620px]">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5 text-center">
          <DialogTitle className="text-lg">Pickup Photos</DialogTitle>
          <DialogDescription>
            Capture vehicle condition before signing
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Photos added</span>
            <span className="font-mono font-medium text-primary">{photoCount} / {PICKUP_PHOTO_MAX}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressValue}%` }} />
          </div>
        </div>

        <div className="px-4 py-4">
          {errors.load && (
            <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.load}
            </div>
          )}
          {errors.upload && (
            <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.upload}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative">
                {previews[photo.id] ? (
                  <img
                    src={previews[photo.id]}
                    alt="pickup"
                    className="h-24 w-full rounded-md border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => deletePhoto(photo)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              handleUpload(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              handleUpload(event.target.files);
              event.target.value = "";
            }}
          />

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 flex-1 gap-1.5 text-xs"
              disabled={uploading || atLimit}
              onClick={() => cameraInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              Take Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 flex-1 gap-1.5 text-xs"
              disabled={uploading || atLimit}
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Choose from Gallery
            </Button>
          </div>
          <div className="mt-1 text-center text-[11px] text-muted-foreground">
            {atLimit ? "Limit reached — " : ""}{photoCount}/{PICKUP_PHOTO_MAX} photos
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 px-4 pb-5 sm:flex-col sm:space-x-0">
          <Button type="button" className="min-h-12 w-full" onClick={onContinue}>
            Continue to Review & Sign
          </Button>
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={onContinue}>
            Skip photos for now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Contracts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dashboardFilter = getDashboardContractFilter(searchParams.get("filter"));
  const activeDashboardFilterLabel = dashboardFilter ? dashboardContractFilterLabels[dashboardFilter] : null;
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ContractFilter>("All");
  const [depositFilter, setDepositFilter] = useState<DepositFilter>("All");
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(createEmptyForm);
  const [showNotes, setShowNotes] = useState(false);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [additionalDriverIds, setAdditionalDriverIds] = useState<string[]>([]);
  const [endTimeManuallyEdited, setEndTimeManuallyEdited] = useState(false);
  const [clientSelectOpen, setClientSelectOpen] = useState(false);
  const [carSelectOpen, setCarSelectOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [carSearch, setCarSearch] = useState("");
  const [sortBy, setSortBy] = useState<"client" | "car" | "start" | "balance">("start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showPickupInspectionModal, setShowPickupInspectionModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [newContractId, setNewContractId] = useState("");
  const [signingClientName, setSigningClientName] = useState("");
  const [signingUserId, setSigningUserId] = useState<string | null>(null);
  const [reopenTargetId, setReopenTargetId] = useState<string | null>(null);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [docExpiredWarnings, setDocExpiredWarnings] = useState<string[]>([]);
  const [vehicleAvailability, setVehicleAvailability] = useState<VehicleAvailability | null>(null);
  const availabilityRequestIdRef = useRef(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [depositReadyCutoff, setDepositReadyCutoff] = useState(() => getDepositReadyCutoff(15));

  const fetchData = async () => {
    setLoading(true);
    try {
      try {
        await syncVehicleStatusesWithContracts();
      } catch (error) {
        console.error("Vehicle status sync failed:", error);
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) {
        toast.error("Could not load contracts: please sign in again.");
        return;
      }

      const [contractsRes, clientsRes, carsRes, profileRes] = await Promise.all([
        supabase
          .from("contracts")
          .select("*, deposit_amount, deposit_returned, clients(full_name, phone, nationality, client_type, emirates_id, passport_number, license_number), cars(plate, make, model, year, color)")
          .eq("owner_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("clients")
          .select("id, full_name, license_number, license_expiry")
          .eq("owner_id", userId)
          .order("full_name"),
        supabase.from("cars").select("id, plate, make, model, status").eq("owner_id", userId).order("plate"),
        supabase.from("profiles").select("deposit_return_days" as never).eq("id", userId).single(),
      ]);
      const depositReturnDays = (profileRes.data as { deposit_return_days?: number | null } | null)?.deposit_return_days ?? 15;
      setDepositReadyCutoff(getDepositReadyCutoff(depositReturnDays));
      if (contractsRes.error) toast.error(`Failed to load contracts: ${toSupabaseMessage(contractsRes.error)}`);
      else {
        const contractRows = (contractsRes.data as ContractRow[]) || [];
        const contractIds = contractRows.map((contract) => contract.id);
        let balanceByContract: Record<string, number> = {};
        let effectiveEndDateByContract: Record<string, string> = {};
        if (contractIds.length > 0) {
          const [balancesResult, extensionsResult] = await Promise.all([
            // contract_balances is not present in the generated database types.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from("contract_balances")
              .select("contract_id, balance_due")
              .in("contract_id", contractIds),
            // contract_fees is not present in the generated database types.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from("contract_fees")
              .select("contract_id, label, amount, extension_start, extension_end")
              .in("contract_id", contractIds),
          ]);
          const { data: balancesData, error: balancesErr } = balancesResult;
          if (balancesErr) {
            toast.error(`Failed to load contract balances: ${toSupabaseMessage(balancesErr)}`);
          } else {
            balanceByContract = Object.fromEntries(
              (balancesData || []).map((balance: { contract_id: string; balance_due: number | string | null }) => [
                balance.contract_id,
                Number(balance.balance_due || 0),
              ]),
            );
          }
          const { data: extensionData, error: extensionsErr } = extensionsResult;
          if (extensionsErr) {
            toast.error(`Failed to load contract extensions: ${toSupabaseMessage(extensionsErr)}`);
          } else {
            effectiveEndDateByContract = (extensionData || []).reduce(
              (latestByContract: Record<string, string>, row: { contract_id: string; extension_end: string | null }) => {
                if (!row.contract_id || !row.extension_end) return latestByContract;
                const current = latestByContract[row.contract_id];
                if (!current || row.extension_end > current) {
                  latestByContract[row.contract_id] = row.extension_end;
                }
                return latestByContract;
              },
              {},
            );
          }
        }

        setContracts(
          contractRows.map((contract) => ({
            ...contract,
            balance_due: balanceByContract[contract.id] ?? Number(contract.total_amount),
            effective_end_date: effectiveEndDateByContract[contract.id] ?? contract.end_date,
          })),
        );
      }
      if (!clientsRes.error) setClients(clientsRes.data || []);
      if (!carsRes.error) setCars(carsRes.data || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load contracts.";
      toast.error(message);
      console.error("Contracts load failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (searchParams.get("sort") === "balance_desc") {
      setSortBy("balance");
      setSortDir("desc");
    }
  }, [searchParams]);

  useEffect(() => {
    if (dashboardFilter === "overdue") {
      setFilter("Overdue");
      setDepositFilter("All");
      return;
    }
    if (dashboardFilter === "deposits-ready") {
      setFilter("Closed");
      setDepositFilter("Held");
      return;
    }
    if (dashboardFilter === "returns-today" || dashboardFilter === "unpaid") {
      setFilter("All");
      setDepositFilter("All");
    }
  }, [dashboardFilter]);

  useEffect(() => {
    if (!form.client_id) {
      setDocExpiredWarnings([]);
      return;
    }
    const checkExpiry = async () => {
      const { data } = await supabase
        .from("clients")
        .select("emirates_id_expiry, passport_expiry, license_expiry")
        .eq("id", form.client_id)
        .single();
      if (!data) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const warnings: string[] = [];
      const check = (value: string | null, label: string) => {
        if (!value) return;
        const d = new Date(value);
        if (d < today) warnings.push(`${label} expired on ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`);
      };
      check((data as any).emirates_id_expiry, "Emirates ID");
      check((data as any).passport_expiry, "Passport");
      check((data as any).license_expiry, "Driving License");
      setDocExpiredWarnings(warnings);
    };
    checkExpiry();
  }, [form.client_id]);

  useEffect(() => {
    if (!form.car_id || !form.start_date || !form.end_date || !form.start_time || !form.end_time) {
      availabilityRequestIdRef.current += 1;
      setVehicleAvailability(null);
      return;
    }

    let cancelled = false;
    const requestId = availabilityRequestIdRef.current + 1;
    availabilityRequestIdRef.current = requestId;
    setVehicleAvailability({ status: "checking" });

    const checkVehicleAvailability = async () => {
      try {
        const conflict = await findVehicleContractOverlap(supabase, {
          carId: form.car_id,
          startDate: form.start_date,
          startTime: form.start_time,
          endDate: form.end_date,
          endTime: form.end_time,
          operation: "contract-create-availability-preview",
        });
        if (cancelled || availabilityRequestIdRef.current !== requestId) return;
        setVehicleAvailability(conflict ? { status: "conflict", conflict } : { status: "available" });
      } catch (error) {
        if (cancelled || availabilityRequestIdRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : "Could not check vehicle availability.";
        setVehicleAvailability({ status: "error", message });
      }
    };

    checkVehicleAvailability();

    return () => {
      cancelled = true;
    };
  }, [form.car_id, form.start_date, form.start_time, form.end_date, form.end_time]);

  const availableCars = useMemo(
    () => cars.filter((c) => c.status?.trim().toLowerCase() === "available"),
    [cars],
  );

  const days = useMemo(
    () => getBillingDays(form.start_date, form.start_time, form.end_date, form.end_time),
    [form.start_date, form.start_time, form.end_date, form.end_time],
  );
  const total = useMemo(() => {
    const rate = Number(form.rate_amount);
    return Number.isFinite(rate) && rate > 0
      ? Math.round(getRateUnits(days, form.rate_type, form.start_date, form.end_date) * rate)
      : 0;
  }, [days, form.end_date, form.rate_amount, form.rate_type, form.start_date]);

  const additionalChargesTotal = useMemo(
    () => additionalCharges.reduce((sum, charge) => {
      const amount = Number(charge.amount);
      return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
    }, 0),
    [additionalCharges],
  );
  const totalWithExtras = total + additionalChargesTotal;

  const rateSummary = useMemo(
    () => formatRateSummary(
      days,
      form.rate_amount,
      form.rate_type,
      total,
      additionalChargesTotal,
      form.start_date,
      form.end_date,
    ),
    [days, form.end_date, form.rate_amount, form.rate_type, form.start_date, total, additionalChargesTotal],
  );

  const billingPeriodLabel = useMemo(
    () => form.rate_type === "Monthly" ? formatMonthlyBillingPeriod(form.start_date, form.end_date) : `${days} days`,
    [days, form.end_date, form.rate_type, form.start_date],
  );

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => client.full_name.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const filteredAvailableCars = useMemo(() => {
    const q = carSearch.trim().toLowerCase();
    if (!q) return availableCars;
    return availableCars.filter((car) => {
      const label = `${car.plate} ${car.make} ${car.model}`.toLowerCase();
      return label.includes(q);
    });
  }, [availableCars, carSearch]);

  const selectedCarLabel = useMemo(() => {
    const selected = availableCars.find((car) => car.id === form.car_id);
    return selected ? `${selected.plate} — ${selected.make} ${selected.model}` : "";
  }, [availableCars, form.car_id]);

  const filtered = useMemo(() => {
    const byDashboardFilter = contracts.filter((contract) =>
      matchesDashboardContractFilter(contract, dashboardFilter, depositReadyCutoff)
    );
    const byStatus = byDashboardFilter.filter((contract) => (
      matchesContractFilter(contract, filter) && matchesDepositFilter(contract, depositFilter)
    ));
    const q = search.trim().toLowerCase();
    const bySearch = !q
      ? byStatus
      : byStatus.filter((c) => {
          const clientName = c.clients?.full_name?.toLowerCase() ?? "";
          const plate = c.cars?.plate?.toLowerCase() ?? "";
          return clientName.includes(q) || plate.includes(q);
        });

    const numericPlate = (plate: string) => {
      const digits = (plate.match(/\d+/g) || []).join("");
      return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
    };

    const withBalance = bySearch.map((c) => ({
      ...c,
      balance: Number(c.balance_due || 0),
    }));

    return withBalance.sort((a, b) => {
      const factor = sortDir === "asc" ? 1 : -1;
      if (sortBy === "client") {
        return factor * (a.clients?.full_name || "").localeCompare(b.clients?.full_name || "");
      }
      if (sortBy === "car") {
        const byDigits = numericPlate(a.cars?.plate || "") - numericPlate(b.cars?.plate || "");
        if (byDigits !== 0) return factor * byDigits;
        return factor * (a.cars?.plate || "").localeCompare(b.cars?.plate || "");
      }
      if (sortBy === "balance") {
        return factor * (a.balance - b.balance);
      }
      return factor * (new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    });
  }, [contracts, dashboardFilter, depositReadyCutoff, filter, depositFilter, search, sortBy, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [dashboardFilter, filter, depositFilter, search, sortBy, sortDir, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, page, pageSize]);

  const paginatedContracts = useMemo(
    () => getPaginatedRows(filtered, page, pageSize),
    [filtered, page, pageSize],
  );
  const contractsEmptyMessage = activeDashboardFilterLabel
    ? `No contracts found for ${activeDashboardFilterLabel}.`
    : "No contracts match this filter.";

  const toggleSort = (column: "client" | "car" | "start" | "balance") => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDir(column === "start" ? "desc" : "asc");
  };

  const sortIcon = (column: "client" | "car" | "start" | "balance") => {
    if (sortBy !== column) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const formatAvailabilityConflictPeriod = (
    conflict: Extract<VehicleAvailability, { status: "conflict" }>["conflict"],
  ) => {
    if (!conflict) return "";
    const startTime = formatTimeDisplay(conflict.start_time);
    const endTime = formatTimeDisplay(conflict.end_time);
    return `${formatDate(conflict.start_date)} ${startTime} to ${formatDate(conflict.end_date)} ${endTime}`;
  };

  const counts = useMemo(() => {
    const base: Record<ContractFilter, number> = { All: contracts.length, Active: 0, Overdue: 0, Closed: 0 };
    contracts.forEach((contract) => {
      if (getContractStatusLabel(contract) === "Active") base.Active++;
      if (isOverdueContract(contract)) base.Overdue++;
      if (matchesContractFilter(contract, "Closed")) base.Closed++;
    });
    return base;
  }, [contracts]);

  const handleContractDialogOpenChange = (nextOpen: boolean) => {
    if (isSubmitting && !nextOpen) return;
    setOpen(nextOpen);
    if (nextOpen) {
      const defaultTime = getRoundedCurrentTimeInput();
      setForm((prev) => ({
        ...prev,
        start_date: prev.start_date || getTodayDateInput(),
        start_time: defaultTime,
        end_time: defaultTime,
      }));
      setEndTimeManuallyEdited(false);
      return;
    }
    availabilityRequestIdRef.current += 1;
    setDocExpiredWarnings([]);
    setClientSelectOpen(false);
    setCarSelectOpen(false);
    setVehicleAvailability(null);
    setAdditionalDriverIds([]);
  };

  const prefillInitialMileage = async (carId: string) => {
    setForm((prev) => ({ ...prev, car_id: carId, initial_mileage: "" }));

    const { data, error } = await (supabase as any)
      .from("car_maintenance")
      .select("current_mileage")
      .eq("car_id", carId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || data?.current_mileage === null || data?.current_mileage === undefined) return;

    setForm((prev) => ({
      ...prev,
      initial_mileage: String(data.current_mileage),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    console.log("Submitting contract form...", { form });

    try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) {
      toast.error("Could not create contract: please sign in again.");
      setIsSubmitting(false);
      return;
    }

    if (!form.client_id) {
      toast.error("Please select a client");
      setIsSubmitting(false);
      return;
    }

    const selectedClient = clients.find((client) => client.id === form.client_id);
    if (!selectedClient) {
      toast.error("Selected client is no longer available. Please choose a valid client.");
      setIsSubmitting(false);
      return;
    }

    if (!form.car_id) {
      toast.error("Please select a car");
      setIsSubmitting(false);
      return;
    }

    const selectedCar = availableCars.find((car) => car.id === form.car_id);
    if (!selectedCar) {
      toast.error("Selected car is no longer available. Please choose another car.");
      setIsSubmitting(false);
      return;
    }

    if (!form.start_date || !form.end_date) {
      toast.error("Please select start and end dates");
      setIsSubmitting(false);
      return;
    }

    if (!getContractDateTime(form.start_date, form.start_time) || !getContractDateTime(form.end_date, form.end_time)) {
      toast.error("Please enter valid start and end times");
      setIsSubmitting(false);
      return;
    }

    if (days <= 0) {
      toast.error("End date and time must be after start date and time.");
      setIsSubmitting(false);
      return;
    }

    if (String(form.rate_amount).trim() === "" || !Number.isFinite(Number(form.rate_amount)) || Number(form.rate_amount) <= 0) {
      toast.error(`Please enter a valid ${form.rate_type.toLowerCase()} rate`);
      setIsSubmitting(false);
      return;
    }

    if (String(form.initial_mileage).trim() === "") {
      toast.error("Please enter initial mileage");
      setIsSubmitting(false);
      return;
    }

    if (!Number.isFinite(Number(form.initial_mileage)) || Number(form.initial_mileage) < 0) {
      toast.error("Please enter a valid initial mileage");
      setIsSubmitting(false);
      return;
    }

    if (String(form.deposit_amount).trim() !== "" && (!Number.isFinite(Number(form.deposit_amount)) || Number(form.deposit_amount) < 0)) {
      toast.error("Please enter a valid deposit amount");
      setIsSubmitting(false);
      return;
    }

    const clientId = form.client_id;

    const checkVehicleOverlap = async () => {
      try {
        const conflict = await findVehicleContractOverlap(supabase, {
          carId: form.car_id,
          startDate: form.start_date,
          startTime: form.start_time,
          endDate: form.end_date,
          endTime: form.end_time,
          operation: "contract-create",
        });
        if (conflict) {
          toast.error(formatContractOverlapMessage(conflict));
          return true;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not check vehicle availability.";
        toast.error(message);
        return true;
      }
      return false;
    };

    if (await checkVehicleOverlap()) {
      setIsSubmitting(false);
      return;
    }

    try {

      console.log("start_time value:", form.start_time);

      const createdId = createContractId();
      const { error } = await supabase.from("contracts").insert({
        id: createdId,
        client_id: clientId,
        car_id: form.car_id,
        start_date: form.start_date,
        end_date: form.end_date,
        start_time: formatTimeForDb(form.start_time),
        end_time: formatTimeForDb(form.end_time),
        rate_type: form.rate_type,
        rate_amount: Number(form.rate_amount),
        total_amount: total,
        deposit_amount: form.deposit_amount === "" ? 0 : Number(form.deposit_amount),
        initial_mileage: Number(form.initial_mileage),
        fuel_level: form.fuel_level,
        status: "Active",
        payment_status: "Unpaid",
        notes: form.notes.trim() || null,
        owner_id: userId,
      });

      if (error) {
        setIsSubmitting(false);
        toast.error("Failed to create contract: " + toSupabaseMessage(error));
        console.error("Contract creation error:", error);
      } else {
        try {
          await saveContractDrivers(createdId, userId, additionalDriverIds);
        } catch (driverError) {
          console.error("Additional drivers insert error:", driverError);
          await supabase.from("contracts").delete().eq("id", createdId);
          toast.error(
            "Contract was not created because additional drivers could not be saved: " +
              (driverError instanceof Error ? driverError.message : "unknown error"),
          );
          return;
        }
        let additionalChargesError: { message?: string } | null = null;
        const chargesToInsert = additionalCharges.filter((charge) => {
          const amount = Number(charge.amount);
          return charge.label.trim() !== "" && Number.isFinite(amount) && amount > 0;
        });
        if (chargesToInsert.length > 0) {
          // contract_fees is not present in the generated database types.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: feesError } = await (supabaseClient as any)
            .from("contract_fees")
            .insert(
              chargesToInsert.map((charge) => ({
                contract_id: createdId,
                category: additionalChargeCategories[charge.label],
                label: charge.label,
                amount: Number(charge.amount),
                owner_id: userId,
              })),
            );
          additionalChargesError = feesError;
          if (feesError) console.error("Additional charges insert error:", feesError);
        }
        setIsSubmitting(false);

        try {
          await syncVehicleStatusesWithContracts();
        } catch (syncErr) {
          console.error("Vehicle status reconciliation failed:", syncErr);
        }

        const resolvedClientName = selectedClient.full_name;
        if (additionalChargesError) {
          toast.error(`Contract created, but additional charges could not be saved: ${toSupabaseMessage(additionalChargesError)}`);
          console.error("Additional charges creation error:", additionalChargesError);
        } else {
          toast.success("Contract created");
        }
        setNewContractId(createdId);
        setSigningClientName(resolvedClientName);
        setSigningUserId(userId);
        setShowPickupInspectionModal(true);
        setForm(createEmptyForm());
        setShowNotes(false);
        setAdditionalCharges([]);
        setAdditionalDriverIds([]);
        setEndTimeManuallyEdited(false);
        setClientSearch("");
        setCarSearch("");
        setOpen(false);
        fetchData();
      }
    } catch (err) {
      toast.error("An unexpected error occurred while creating contract");
      console.error(err);
    }
    } catch (err) {
      toast.error("An unexpected error occurred while creating contract");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopenContract = async () => {
    if (!reopenTargetId) return;
    const { error } = await supabase
      .from("contracts")
      .update({ status: "returned" } as any)
      .eq("id", reopenTargetId);
    setReopenConfirmOpen(false);
    setReopenTargetId(null);
    if (error) {
      toast.error("Failed to reopen contract: " + error.message);
    } else {
      toast.success("Contract reopened — status set to Returned");
      fetchData();
    }
  };

  return (
    <DashboardLayout title="Contracts" subtitle="Manage rental agreements" mobileContractsNav>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client or plate"
              className="h-9 pl-9 text-sm"
            />
          </div>
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex w-max gap-1.5 pb-1">
              {mobileFilterOrder.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={cn(
                    "h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                    filter === item
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {item} <span className="font-mono opacity-70">{counts[item] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
              {desktopFilters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === f
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                  <span className="ml-1.5 opacity-60">{counts[f] ?? 0}</span>
                </button>
              ))}
            </div>
            <Select value={depositFilter} onValueChange={(value) => setDepositFilter(value as DepositFilter)}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue placeholder="Deposit" />
              </SelectTrigger>
              <SelectContent>
                {depositFilters.map((item) => (
                  <SelectItem key={item} value={item}>{item === "All" ? "All deposits" : item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={open} onOpenChange={handleContractDialogOpenChange}>
            <DialogTrigger asChild>
              <Button size="sm" className="hidden gap-1.5 md:inline-flex">
                <Plus className="h-4 w-4" />
                New Contract
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-[640px]">
              <DialogHeader>
                <DialogTitle>Create new contract</DialogTitle>
                <DialogDescription>Total amount is calculated automatically.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
                  <Label className="text-sm">Client</Label>
                  <Popover open={clientSelectOpen} onOpenChange={setClientSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        <span className={cn(!form.client_id && "text-muted-foreground")}>
                          {form.client_id
                            ? clients.find((c) => c.id === form.client_id)?.full_name
                            : "Select a client"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="z-[70] w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search client..."
                          value={clientSearch}
                          onValueChange={setClientSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No client found.</CommandEmpty>
                          <CommandGroup>
                            {filteredClients.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={() => {
                                  setForm((prev) => ({ ...prev, client_id: c.id }));
                                  setAdditionalDriverIds((prev) => prev.filter((id) => id !== c.id));
                                  setClientSelectOpen(false);
                                  setClientSearch("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    form.client_id === c.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                {c.full_name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Client not found? Add the client first from Clients.
                  </p>
                </div>
                <AdditionalDriversField
                  clients={clients}
                  primaryClientId={form.client_id}
                  value={additionalDriverIds}
                  onChange={setAdditionalDriverIds}
                />
                {docExpiredWarnings.length > 0 && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 space-y-1">
                    {docExpiredWarnings.map((w, i) => (
                      <div key={i} className="text-sm text-destructive">
                        ⚠️ Warning: <span className="font-mono">{w}</span>. Contract cannot be created.
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>Car (Available only)</Label>
                  <Popover open={carSelectOpen} onOpenChange={setCarSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        <span className={cn(!form.car_id && "text-muted-foreground")}>
                          {selectedCarLabel || "Select a car"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="z-[70] w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search car..."
                          value={carSearch}
                          onValueChange={setCarSearch}
                        />
                        <CommandList>
                          <CommandEmpty>No available car found.</CommandEmpty>
                          <CommandGroup>
                            {filteredAvailableCars.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={() => {
                                  prefillInitialMileage(c.id);
                                  setCarSelectOpen(false);
                                  setCarSearch("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    form.car_id === c.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                {c.plate} — {c.make} {c.model}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {vehicleAvailability && (
                    <div
                      className={cn(
                        "text-xs",
                        vehicleAvailability.status === "available" && "text-tint-green-foreground",
                        vehicleAvailability.status === "conflict" && "text-destructive",
                        (vehicleAvailability.status === "checking" || vehicleAvailability.status === "error") &&
                          "text-muted-foreground",
                      )}
                    >
                      {vehicleAvailability.status === "checking" && "Checking availability..."}
                      {vehicleAvailability.status === "available" && "Available for selected period"}
                      {vehicleAvailability.status === "conflict" && (
                        <>
                          <span>Not available for selected period</span>
                          <span className="block font-mono">
                            {formatAvailabilityConflictPeriod(vehicleAvailability.conflict)}
                          </span>
                        </>
                      )}
                      {vehicleAvailability.status === "error" && (
                        <>
                          {vehicleAvailability.message}
                          <span className="block">Tap Create Contract to retry availability.</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="start">Start Date</Label>
                    <Input id="start" type="date" required value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="end">End Date</Label>
                    <Input id="end" type="date" required value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="start-time">Start Time</Label>
                    <Input
                      id="start-time"
                      type="time"
                      required
                      value={form.start_time}
                      onChange={(e) => {
                        const startTime = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          start_time: startTime,
                          end_time: endTimeManuallyEdited ? prev.end_time : startTime,
                        }));
                      }}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="end-time">End Time</Label>
                    <Input
                      id="end-time"
                      type="time"
                      required
                      value={form.end_time}
                      onChange={(e) => {
                        setEndTimeManuallyEdited(true);
                        setForm((prev) => ({ ...prev, end_time: e.target.value }));
                      }}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-[#121830] p-1">
                    {rateTypes.map((rateType) => (
                      <Button
                        key={rateType}
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-10 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                          form.rate_type === rateType && "bg-muted text-foreground shadow-sm hover:bg-muted",
                        )}
                        onClick={() => setForm((prev) => ({ ...prev, rate_type: rateType }))}
                      >
                        {rateType}
                      </Button>
                    ))}
                  </div>
                  <Label htmlFor="rate">{rateLabels[form.rate_type]}</Label>
                  <Input
                    id="rate"
                    type="number"
                    min={0}
                    required
                    className="font-mono"
                    value={form.rate_amount}
                    onFocus={() => {
                      if (Number(form.rate_amount) === 0) {
                        setForm((prev) => ({ ...prev, rate_amount: "" }));
                      }
                    }}
                    onChange={(e) => setForm((prev) => ({ ...prev, rate_amount: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="mileage">Initial Mileage (km)</Label>
                    <Input
                      id="mileage"
                      type="number"
                      min={0}
                      value={form.initial_mileage}
                      required
                      onChange={(e) => setForm((prev) => ({ ...prev, initial_mileage: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Fuel Level</Label>
                    <Select value={form.fuel_level} onValueChange={(v) => setForm((prev) => ({ ...prev, fuel_level: v as FuelLevel }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fuelLevels.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  {additionalCharges.map((charge) => (
                    <div key={charge.id} className="grid grid-cols-[minmax(0,1fr)_minmax(100px,0.7fr)_44px] gap-2">
                      <Select
                        value={charge.label}
                        onValueChange={(value) => {
                          setAdditionalCharges((charges) =>
                            charges.map((item) =>
                              item.id === charge.id ? { ...item, label: value as AdditionalChargeLabel } : item,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger aria-label="Charge type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {additionalChargeLabels.map((label) => (
                            <SelectItem key={label} value={label}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="font-mono"
                        aria-label={`${charge.label} amount in AED`}
                        placeholder="AED"
                        value={charge.amount}
                        onChange={(e) => {
                          const amount = e.target.value;
                          setAdditionalCharges((charges) =>
                            charges.map((item) => item.id === charge.id ? { ...item, amount } : item),
                          );
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 text-lg md:h-10 md:w-10"
                        aria-label={`Remove ${charge.label} charge`}
                        onClick={() => setAdditionalCharges((charges) => charges.filter((item) => item.id !== charge.id))}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    onClick={() => {
                      setAdditionalCharges((charges) => [
                        ...charges,
                        { id: createContractId(), label: "Delivery", amount: "" },
                      ]);
                    }}
                  >
                    + Add charge
                  </Button>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="deposit">Deposit Amount (AED)</Label>
                  <Input
                    id="deposit"
                    type="number"
                    min={0}
                    value={form.deposit_amount}
                    onFocus={() => {
                      if (Number(form.deposit_amount) === 0) {
                        setForm((prev) => ({ ...prev, deposit_amount: "" }));
                      }
                    }}
                    onChange={(e) => setForm((prev) => ({ ...prev, deposit_amount: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto w-fit p-0 text-sm"
                    onClick={() => setShowNotes((visible) => !visible)}
                  >
                    {showNotes ? "− Hide notes" : "+ Add notes"}
                  </Button>
                  {showNotes && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="contract-notes">Notes</Label>
                      <Textarea
                        id="contract-notes"
                        placeholder="e.g. deposit paid in cash USD, client requested early return"
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Total Amount</div>
                    <div className="font-mono text-lg font-semibold text-foreground">
                      AED {totalWithExtras.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{rateSummary}</div>
                  </div>
                  <div className="text-right font-mono text-xs text-muted-foreground">
                    <div>{billingPeriodLabel}</div>
                    <div>{form.rate_type} total</div>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || docExpiredWarnings.length > 0 || vehicleAvailability?.status === "conflict"}
                  >
                    {isSubmitting ? "Creating..." : "Create Contract"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
            <DialogTrigger asChild>
              <Button
                size="icon"
                className="fixed bottom-20 right-4 z-50 h-12 w-12 rounded-full shadow-lg md:hidden"
                aria-label="New Contract"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>

        <div className="-mx-3 md:mx-0 md:rounded-xl md:border md:border-border md:bg-card">
          <div className="hidden border-b border-border p-4 md:block">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client name or car plate"
              className="h-9 max-w-md text-sm"
            />
          </div>
          <div className="space-y-1.5 pb-28 md:hidden">
            {loading ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading contracts...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">{contractsEmptyMessage}</div>
            ) : (
              paginatedContracts.map((c) => {
                const clientName = c.clients?.full_name ?? "-";
                const mobileStatus = getMobileCardStatus(c);
                const vehicleLabel = c.cars ? `${c.cars.plate} • ${c.cars.make} ${c.cars.model}` : "-";
                const balance = Number(c.balance_due || 0);
                const depositAmount = Number(c.deposit_amount || 0);
                const hasBalanceDue = balance > 0;
                const hasDeposit = depositAmount > 0;
                const depositState = getDepositState(c);
                const isDepositReturned = depositState === "Returned";
                return (
                  <div key={c.id} className="px-1.5">
                    <div
                      role="link"
                      tabIndex={0}
                      className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-lg border border-border/70 bg-card/80 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => navigate(`/contracts/${c.id}`)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/contracts/${c.id}`);
                        }
                      }}
                    >
                      <span className="min-w-0 truncate text-left text-sm font-bold leading-5 text-foreground">
                        {clientName}
                      </span>
                      {mobileStatus.isClosed ? (
                        <button
                          type="button"
                          className={cn("inline-flex h-8 items-center self-center justify-self-end rounded-full px-2 text-[10px] font-medium", mobileStatus.className)}
                          aria-label="Reopen contract"
                          title="Reopen contract"
                          onClick={(event) => {
                            event.stopPropagation();
                            setReopenTargetId(c.id);
                            setReopenConfirmOpen(true);
                          }}
                        >
                          {mobileStatus.label}
                        </button>
                      ) : (
                        <span className={cn("inline-flex self-center justify-self-end rounded-full px-2 py-0.5 text-[10px] font-medium", mobileStatus.className)}>
                          {mobileStatus.label}
                        </span>
                      )}

                      <div className="col-span-2 pb-1 font-mono text-xs leading-4 text-muted-foreground">
                        {formatMobileDate(c.start_date)} → {formatMobileDate(getEffectiveContractEndDate(c))}
                      </div>

                      <span className="min-w-0 truncate text-xs leading-5 text-muted-foreground">
                        {vehicleLabel}
                      </span>
                      <span className="justify-self-end whitespace-nowrap font-mono text-sm font-semibold leading-5 text-foreground">
                        AED {Number(c.total_amount).toLocaleString()}
                      </span>

                      {(hasBalanceDue || hasDeposit) && (
                        <div className="col-span-2 mt-1 border-t border-border/70 pt-2">
                          <div className="grid grid-cols-2 gap-3">
                            {hasBalanceDue && (
                              <div>
                                <div className="text-[10px] font-semibold uppercase leading-3 text-[#3d5478]">DUE</div>
                                <div className="mt-1 font-mono text-base leading-5 text-[#f87171]">
                                  AED {balance.toLocaleString()}
                                </div>
                              </div>
                            )}
                            {hasDeposit && (
                              <div className={cn("text-right", !hasBalanceDue && "col-start-2")}>
                                <div className="text-[10px] font-semibold uppercase leading-3 text-[#3d5478]">DEPOSIT</div>
                                <div className="mt-1 flex items-center justify-end gap-2">
                                  <span className={cn("font-mono text-sm leading-5", isDepositReturned ? "text-muted-foreground" : "text-foreground")}>
                                    AED {depositAmount.toLocaleString()}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded border px-[7px] py-0.5 text-[10px] font-bold leading-3",
                                      isDepositReturned
                                        ? "border-border bg-muted text-muted-foreground"
                                        : "border-[#4a3510] bg-[#2a1f05] text-[#fbbf24]",
                                    )}
                                  >
                                    {depositState.toUpperCase()}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">
                  <button type="button" onClick={() => toggleSort("client")} className="inline-flex items-center gap-1">
                    Client
                    {sortIcon("client")}
                  </button>
                </TableHead>
                <TableHead className="text-xs">
                  <button type="button" onClick={() => toggleSort("car")} className="inline-flex items-center gap-1">
                    Car
                    {sortIcon("car")}
                  </button>
                </TableHead>
                <TableHead className="text-xs">
                  <button type="button" onClick={() => toggleSort("start")} className="inline-flex items-center gap-1">
                    Start
                    {sortIcon("start")}
                  </button>
                </TableHead>
                <TableHead className="text-xs">End</TableHead>
                <TableHead className="text-xs">Days</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">
                  <button type="button" onClick={() => toggleSort("balance")} className="inline-flex items-center gap-1">
                    Balance
                    {sortIcon("balance")}
                  </button>
                </TableHead>
                <TableHead className="px-5 text-right text-xs">Deposit</TableHead>
                <TableHead className="w-[104px] px-2 text-right text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-sm text-muted-foreground">Loading contracts...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-sm text-muted-foreground">{contractsEmptyMessage}</TableCell>
                </TableRow>
              ) : (
                paginatedContracts.map((c) => {
                  const effectiveEndDate = getEffectiveContractEndDate(c);
                  const d = diffDays(c.start_date, effectiveEndDate);
                  const balance = Number(c.balance_due || 0);
                  const depositAmount = Number(c.deposit_amount || 0);
                  const hasDeposit = depositAmount > 0;
                  const depositState = getDepositState(c);
                  const isDepositReturned = depositState === "Returned";
                  const statusLabel = getContractStatusLabel(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="px-5 font-medium text-foreground">
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() => navigate(`/contracts/${c.id}`)}
                        >
                          {c.clients?.full_name ?? "—"}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs text-foreground">{c.cars?.plate ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.cars ? `${c.cars.make} ${c.cars.model}` : ""}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateWithTime(c.start_date, c.start_time)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateWithTime(effectiveEndDate, c.end_time)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {Number(c.total_amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[statusLabel] ?? "bg-muted text-muted-foreground")}>
                          {statusLabel}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "px-5 font-mono text-sm font-medium",
                          balance > 0
                            ? "text-tint-rose-foreground"
                            : c.payment_status === "Paid"
                              ? "text-tint-green-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {balance > 0 ? `AED ${balance.toLocaleString()}` : c.payment_status === "Paid" ? "Paid" : "—"}
                      </TableCell>
                      <TableCell className="px-5 text-right">
                        {!hasDeposit ? (
                          <div className="text-sm text-[#2d3f5c]">—</div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <div className={cn("font-mono text-sm font-medium", isDepositReturned ? "text-[#475569]" : "text-foreground")}>
                              AED {depositAmount.toLocaleString()}
                            </div>
                            <span
                              className={cn(
                                "rounded border px-[7px] py-0.5 text-[10px] font-bold uppercase leading-3",
                                isDepositReturned
                                  ? "border-border bg-muted text-muted-foreground"
                                  : "border-[#4a3510] bg-[#2a1f05] text-[#fbbf24]",
                              )}
                            >
                              {depositState.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="w-[104px] px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            aria-label="Download contract PDF"
                            title="Download contract PDF"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await generateContractPdf(c);
                                toast.success("Contract PDF downloaded");
                              } catch (err) {
                                toast.error("Failed to generate PDF");
                                console.error(err);
                              }
                            }}
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                          {c.status === "closed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReopenTargetId(c.id);
                                setReopenConfirmOpen(true);
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reopen
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      <AlertDialog open={reopenConfirmOpen} onOpenChange={(v) => { setReopenConfirmOpen(v); if (!v) setReopenTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              Status will change to <span className="font-mono">Returned</span>. The contract can be closed again afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReopenContract}>Reopen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {newContractId && (
        <>
          <PickupInspectionModal
            contractId={newContractId}
            uploadedBy={signingUserId}
            open={showPickupInspectionModal}
            onContinue={() => {
              setShowPickupInspectionModal(false);
              setShowSignModal(true);
            }}
          />
          <SignContractModal
            contractId={newContractId}
            clientName={signingClientName}
            open={showSignModal}
            onComplete={() => {
              setShowSignModal(false);
              setOpen(false);
              setForm(createEmptyForm());
              setEndTimeManuallyEdited(false);
              setClientSearch("");
              setCarSearch("");
              fetchData();
            }}
          />
        </>
      )}
    </DashboardLayout>
  );
};

export default Contracts;
