import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Download, Check, ChevronsUpDown, ArrowUp, ArrowDown, Trash2, RotateCcw, Camera, Image as ImageIcon, Loader2, MoreHorizontal, Search, CalendarDays } from "lucide-react";
import { generateContractPdf } from "@/lib/contractPdf";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { syncVehicleStatusesWithContracts } from "@/lib/vehicleStatusSync";
import { findVehicleContractOverlap, formatContractOverlapMessage } from "@/lib/contractOverlap";
import { toast } from "sonner";
import { SignContractModal } from "@/components/SignContractModal";
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

type ContractFilter = "All" | "Active" | "Expiring Soon" | "Overdue" | "Closed";
type PaymentStatus = "Paid" | "Partial" | "Unpaid";
type RateType = "Daily" | "Weekly" | "Monthly" | "Yearly";
type FuelLevel = "Empty" | "Quarter" | "Half" | "Three Quarters" | "Full";

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
  initial_mileage: number;
  fuel_level: string;
  status: string;
  payment_status: string;
  paid_amount?: number;
  client_signature?: string | null;
  manager_signature?: string | null;
  clients: { full_name: string; phone: string; nationality: string; client_type: string; emirates_id: string | null; passport_number: string | null; license_number: string | null } | null;
  cars: { plate: string; make: string; model: string; year: number } | null;
}

interface ClientOption { id: string; full_name: string; }
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
  Active: "bg-tint-blue text-tint-blue-foreground",
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

const desktopFilters: ContractFilter[] = ["All", "Active", "Expiring Soon", "Overdue"];
const mobileFilterOrder: ContractFilter[] = ["All", "Active", "Expiring Soon", "Overdue", "Closed"];
const fuelLevels: FuelLevel[] = ["Empty", "Quarter", "Half", "Three Quarters", "Full"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMobileDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function matchesContractFilter(contract: ContractRow, selectedFilter: ContractFilter): boolean {
  if (selectedFilter === "All") return true;
  if (selectedFilter === "Closed") {
    const status = contract.status.toLowerCase();
    return status === "closed" || status === "completed" || status === "returned";
  }
  return contract.status === selectedFilter;
}

function getClientInitials(name: string | undefined | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function getMobileStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "closed" || normalized === "completed" || normalized === "returned") return "Closed";
  return status;
}

function getMobileStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-tint-green text-tint-green-foreground";
  if (normalized === "expiring soon") return "bg-tint-amber text-tint-amber-foreground";
  if (normalized.includes("overdue")) return "bg-tint-rose text-tint-rose-foreground";
  if (normalized === "closed" || normalized === "completed" || normalized === "returned") return "bg-muted text-muted-foreground";
  return statusClasses[status] ?? "bg-muted text-muted-foreground";
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
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(0, Math.round((e - s) / 86_400_000));
}

function getContractDateTime(date: string, time: string): Date | null {
  if (!date || !time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getBillingDays(startDate: string, startTime: string, endDate: string, endTime: string): number {
  const start = getContractDateTime(startDate, startTime);
  const end = getContractDateTime(endDate, endTime);
  if (!start || !end || end <= start) return 0;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function getCalendarMonths(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;

  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  const lastDayOfTargetMonth = new Date(start.getFullYear(), start.getMonth() + months + 1, 0).getDate();
  const anniversary = new Date(
    start.getFullYear(),
    start.getMonth() + months,
    Math.min(start.getDate(), lastDayOfTargetMonth),
  );

  return Math.max(0, months - (end < anniversary ? 1 : 0));
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
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
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

const emptyForm = {
  client_id: "",
  car_id: "",
  start_date: "",
  start_time: "",
  end_date: "",
  end_time: "",
  rate_type: "Daily",
  rate_amount: 100,
  deposit_amount: 0,
  initial_mileage: "",
  fuel_level: "Full" as FuelLevel,
  special_conditions: "",
};

const PICKUP_PHOTO_SLOTS = [
  { key: "front", label: "Front", legacySlots: ["Front"] },
  { key: "rear", label: "Rear", legacySlots: ["Rear"] },
  { key: "left_side", label: "Left side", legacySlots: ["Left side"] },
  { key: "right_side", label: "Right side", legacySlots: ["Right side"] },
  { key: "dashboard", label: "Dashboard", legacySlots: ["Dashboard / odometer"] },
  { key: "odometer", label: "Odometer", legacySlots: [] },
  { key: "interior_front", label: "Interior front", legacySlots: [] },
  { key: "interior_rear", label: "Interior rear", legacySlots: [] },
];

type PickupPhotoSlot = (typeof PICKUP_PHOTO_SLOTS)[number];

function pickupSlotKey(slot: string): string {
  return slot.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getPickupSlotKeys(slot: PickupPhotoSlot): string[] {
  return [slot.key, ...slot.legacySlots];
}

interface PickupInspectionModalProps {
  contractId: string;
  uploadedBy: string | null;
  open: boolean;
  onContinue: () => void;
}

function PickupInspectionModal({ contractId, uploadedBy, open, onContinue }: PickupInspectionModalProps) {
  const [photos, setPhotos] = useState<Record<string, { id: string; photo_url: string; uploaded_at: string | null }>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadingSlot, setUploadingSlot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addedPhotoCount = PICKUP_PHOTO_SLOTS.filter((slot) => getPickupSlotKeys(slot).some((key) => photos[key])).length;
  const progressValue = (addedPhotoCount / PICKUP_PHOTO_SLOTS.length) * 100;

  useEffect(() => {
    if (!open || !contractId) return;

    let cancelled = false;
    const loadPhotos = async () => {
      const { data, error } = await (supabase as any)
        .from("contract_inspections")
        .select("id, slot, photo_url, uploaded_at")
        .eq("contract_id", contractId)
        .eq("type", "pickup");

      if (cancelled) return;
      if (error) {
        setErrors((prev) => ({ ...prev, load: "Could not load pickup photos." }));
        return;
      }

      const nextPhotos: Record<string, { id: string; photo_url: string; uploaded_at: string | null }> = {};
      (data ?? []).forEach((photo: { id: string; slot: string; photo_url: string; uploaded_at: string | null }) => {
        nextPhotos[photo.slot] = {
          id: photo.id,
          photo_url: photo.photo_url,
          uploaded_at: photo.uploaded_at,
        };
      });
      setPhotos(nextPhotos);
      setErrors((prev) => ({ ...prev, load: "" }));
    };

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [contractId, open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadPreviews = async () => {
      const nextPreviews: Record<string, string> = {};
      await Promise.all(
        Object.entries(photos).map(async ([slot, photo]) => {
          if (!photo.photo_url) return;
          if (/^(https?:|data:|blob:)/.test(photo.photo_url)) {
            nextPreviews[slot] = photo.photo_url;
            return;
          }
          const { data } = supabase.storage
            .from("inspection-photos")
            .getPublicUrl(photo.photo_url);
          if (data?.publicUrl) nextPreviews[slot] = data.publicUrl;
        }),
      );
      if (!cancelled) setPreviews(nextPreviews);
    };

    loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [photos, open]);

  const handleUpload = async (slot: string, file: File | undefined, existingSlot = slot) => {
    if (!file) return;

    setUploadingSlot(slot);
    setErrors((prev) => ({ ...prev, [slot]: "" }));

    const path = `${contractId}/pickup/${pickupSlotKey(slot)}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("inspection-photos")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      setUploadingSlot("");
      setErrors((prev) => ({ ...prev, [slot]: uploadError.message }));
      return;
    }

    const payload = {
      contract_id: contractId,
      type: "pickup",
      slot,
      photo_url: path,
      uploaded_at: new Date().toISOString(),
      uploaded_by: uploadedBy,
    };

    const existing = photos[existingSlot];
    const { data, error: saveError } = existing
      ? await (supabase as any)
          .from("contract_inspections")
          .update(payload)
          .eq("id", existing.id)
          .select("id, slot, photo_url, uploaded_at")
          .single()
      : await (supabase as any)
          .from("contract_inspections")
          .insert(payload)
          .select("id, slot, photo_url, uploaded_at")
          .single();

    setUploadingSlot("");
    if (saveError) {
      setErrors((prev) => ({ ...prev, [slot]: saveError.message }));
      return;
    }

    if (data) {
      setPhotos((prev) => {
        const next = { ...prev };
        if (existingSlot !== slot) delete next[existingSlot];
        next[slot] = {
          id: data.id,
          photo_url: data.photo_url,
          uploaded_at: data.uploaded_at,
        };
        return next;
      });
    }
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
            <span className="font-mono font-medium text-primary">{addedPhotoCount} / {PICKUP_PHOTO_SLOTS.length}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressValue}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-4 py-4">
          {errors.load && (
            <div className="col-span-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.load}
            </div>
          )}
          {PICKUP_PHOTO_SLOTS.map((slot, index) => {
            const slotKeys = getPickupSlotKeys(slot);
            const photoKey = slotKeys.find((key) => photos[key]) ?? slot.key;
            const photo = photos[photoKey];
            const preview = previews[photoKey];
            const error = errors[slot.key] ?? errors[photoKey];
            const isUploading = uploadingSlot === slot.key;
            const hasPhoto = Boolean(photo);
            return (
              <div
                key={slot.key}
                className={cn(
                  "overflow-hidden rounded-lg border bg-card",
                  hasPhoto ? "border-tint-green/40" : "border-border",
                )}
              >
                <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-2.5">
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      hasPhoto ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {index + 1}
                  </div>
                  <div className="truncate text-[13px] font-medium text-foreground">{slot.label}</div>
                </div>
                <div className="mx-2.5">
                  {preview ? (
                    <img src={preview} alt={`${slot.label} pickup`} className="h-[90px] w-full rounded-md border border-border object-cover" />
                  ) : (
                    <div className="flex h-[90px] w-full items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
                      <ImageIcon className="h-7 w-7" />
                    </div>
                  )}
                  {photo?.uploaded_at && (
                    <div className="mt-1 truncate text-[10px] text-muted-foreground">
                      Uploaded {new Date(photo.uploaded_at).toLocaleString("en-GB")}
                    </div>
                  )}
                  {error && <div className="mt-1 text-[11px] text-destructive">{error}</div>}
                </div>
                <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-2">
                  <div className={cn("flex items-center gap-1.5 text-[11px]", hasPhoto ? "text-tint-green-foreground" : "text-muted-foreground")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", hasPhoto ? "bg-tint-green" : "bg-muted-foreground/60")} />
                    {hasPhoto ? "Added" : "Missing"}
                  </div>
                  <input
                    ref={(node) => {
                      inputRefs.current[slot.key] = node;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => {
                      handleUpload(slot.key, event.target.files?.[0], photoKey);
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1 px-1.5 text-xs text-primary hover:text-primary"
                    disabled={isUploading}
                    onClick={() => inputRefs.current[slot.key]?.click()}
                  >
                    {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    {isUploading ? "Uploading..." : hasPhoto ? "Retake" : "Take Photo"}
                  </Button>
                </div>
              </div>
            );
          })}
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
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ContractFilter>("All");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchData = async () => {
    try {
      await syncVehicleStatusesWithContracts();
    } catch (error) {
      console.error("Vehicle status sync failed:", error);
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) {
      toast.error("Could not load contracts: please sign in again.");
      setLoading(false);
      return;
    }

    const [contractsRes, clientsRes, carsRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("*, clients(full_name, phone, nationality, client_type, emirates_id, passport_number, license_number), cars(plate, make, model, year)")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("id, full_name").eq("owner_id", userId).order("full_name"),
      supabase.from("cars").select("id, plate, make, model, status").eq("owner_id", userId).order("plate"),
    ]);
    if (contractsRes.error) toast.error(`Failed to load contracts: ${toSupabaseMessage(contractsRes.error)}`);
    else {
      const contractRows = (contractsRes.data as ContractRow[]) || [];
      const contractIds = contractRows.map((contract) => contract.id);
      let paidByContract: Record<string, number> = {};
      if (contractIds.length > 0) {
        const { data: paymentsData, error: paymentsErr } = await supabase
          .from("payments")
          .select("contract_id, amount")
          .eq("owner_id", userId)
          .in("contract_id", contractIds);
        if (!paymentsErr) {
          paidByContract = (paymentsData || []).reduce<Record<string, number>>((acc, payment) => {
            const key = payment.contract_id;
            if (!key) return acc;
            acc[key] = (acc[key] || 0) + Number(payment.amount || 0);
            return acc;
          }, {});
        }
      }

      setContracts(
        contractRows.map((contract) => ({
          ...contract,
          paid_amount: paidByContract[contract.id] || 0,
        })),
      );
    }
    if (!clientsRes.error) setClients(clientsRes.data || []);
    if (!carsRes.error) setCars(carsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      setVehicleAvailability(null);
      return;
    }

    let cancelled = false;
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
        if (cancelled) return;
        setVehicleAvailability(conflict ? { status: "conflict", conflict } : { status: "available" });
      } catch (error) {
        if (cancelled) return;
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
    if (!form.rate_amount || !days) return 0;
    if (form.rate_type === "Daily") return form.rate_amount * days;
    if (form.rate_type === "Weekly") return form.rate_amount * (days / 7);
    if (form.rate_type === "Monthly") return form.rate_amount * getCalendarMonths(form.start_date, form.end_date);
    return form.rate_amount * (days / 365);
  }, [form.rate_type, form.rate_amount, form.start_date, form.end_date, days]);

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
    const byStatus = contracts.filter((contract) => matchesContractFilter(contract, filter));
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
      balance: Math.max(0, Number(c.total_amount) - Number(c.paid_amount || 0)),
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
  }, [contracts, filter, search, sortBy, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [filter, search, sortBy, sortDir, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, page, pageSize]);

  const paginatedContracts = useMemo(
    () => getPaginatedRows(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

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
    const base: Record<ContractFilter, number> = { All: contracts.length, Active: 0, "Expiring Soon": 0, Overdue: 0, Closed: 0 };
    contracts.forEach((contract) => {
      if (contract.status === "Active") base.Active++;
      if (contract.status === "Expiring Soon") base["Expiring Soon"]++;
      if (contract.status === "Overdue") base.Overdue++;
      if (matchesContractFilter(contract, "Closed")) base.Closed++;
    });
    return base;
  }, [contracts]);

  const handleContractDialogOpenChange = (nextOpen: boolean) => {
    if (saving && !nextOpen) return;
    setOpen(nextOpen);
    if (nextOpen) {
      const defaultTime = getRoundedCurrentTimeInput();
      setForm((prev) => ({ ...prev, start_time: defaultTime, end_time: defaultTime }));
      setEndTimeManuallyEdited(false);
      return;
    }
    setDocExpiredWarnings([]);
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
    console.log("Submitting contract form...", { form });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) {
      toast.error("Could not create contract: please sign in again.");
      return;
    }

    if (!form.client_id) {
      toast.error("Please select a client");
      return;
    }

    const selectedClient = clients.find((client) => client.id === form.client_id);
    if (!selectedClient) {
      toast.error("Selected client is no longer available. Please choose a valid client.");
      return;
    }

    if (!form.car_id) {
      toast.error("Please select a car");
      return;
    }

    const selectedCar = availableCars.find((car) => car.id === form.car_id);
    if (!selectedCar) {
      toast.error("Selected car is no longer available. Please choose another car.");
      return;
    }

    if (!form.start_date || !form.end_date) {
      toast.error("Please select start and end dates");
      return;
    }

    if (!getContractDateTime(form.start_date, form.start_time) || !getContractDateTime(form.end_date, form.end_time)) {
      toast.error("Please enter valid start and end times");
      return;
    }

    if (days <= 0) {
      toast.error("End date and time must be after start date and time.");
      return;
    }

    if (!Number.isFinite(Number(form.rate_amount)) || Number(form.rate_amount) <= 0) {
      toast.error("Please enter a valid rate amount");
      return;
    }

    if (String(form.initial_mileage).trim() === "") {
      toast.error("Please enter initial mileage");
      return;
    }

    if (!Number.isFinite(Number(form.initial_mileage)) || Number(form.initial_mileage) < 0) {
      toast.error("Please enter a valid initial mileage");
      return;
    }

    if (!Number.isFinite(Number(form.deposit_amount)) || Number(form.deposit_amount) < 0) {
      toast.error("Please enter a valid deposit amount");
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

    setSaving(true);
    if (await checkVehicleOverlap()) {
      setSaving(false);
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
        deposit_amount: Number(form.deposit_amount),
        initial_mileage: Number(form.initial_mileage),
        fuel_level: form.fuel_level,
        status: "Active",
        payment_status: "Unpaid",
        owner_id: userId,
      });

      setSaving(false);
      if (error) {

        toast.error("Failed to create contract: " + toSupabaseMessage(error));
        console.error("Contract creation error:", error);
      } else {
        try {
          await syncVehicleStatusesWithContracts();
        } catch (syncErr) {
          console.error("Vehicle status reconciliation failed:", syncErr);
        }

        const resolvedClientName = selectedClient.full_name;
        toast.success("Contract created");
        setNewContractId(createdId);
        setSigningClientName(resolvedClientName);
        setSigningUserId(userId);
        setShowPickupInspectionModal(true);
        setForm(emptyForm);
        setEndTimeManuallyEdited(false);
        setClientSearch("");
        setCarSearch("");
        setOpen(false);
        fetchData();
      }
    } catch (err) {
      setSaving(false);
      toast.error("An unexpected error occurred while creating contract");
      console.error(err);
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
          <div className="hidden flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 md:flex">
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

          <Dialog open={open} onOpenChange={handleContractDialogOpenChange}>
            <DialogTrigger asChild>
              <Button size="sm" className="hidden gap-1.5 md:inline-flex">
                <Plus className="h-4 w-4" />
                New Contract
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
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
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
                      {vehicleAvailability.status === "error" && vehicleAvailability.message}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Rate Type</Label>
                    <Select value={form.rate_type} onValueChange={(v) => setForm((prev) => ({ ...prev, rate_type: v as RateType }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Daily">Daily</SelectItem>
                        <SelectItem value="Weekly">Weekly</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                        <SelectItem value="Yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="rate">Rate (AED)</Label>
                    <Input
                      id="rate"
                      type="number"
                      min={0}
                      required
                      value={form.rate_amount}
                      onFocus={(e) => {
                        if (Number(form.rate_amount) === 0) e.currentTarget.select();
                      }}
                      onChange={(e) => setForm((prev) => ({ ...prev, rate_amount: Number(e.target.value) }))}
                    />
                  </div>
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
                <div className="grid gap-1.5">
                  <Label htmlFor="deposit">Deposit Amount (AED)</Label>
                  <Input
                    id="deposit"
                    type="number"
                    min={0}
                    value={form.deposit_amount}
                    onFocus={(e) => {
                      if (Number(form.deposit_amount) === 0) e.currentTarget.select();
                    }}
                    onChange={(e) => setForm((prev) => ({ ...prev, deposit_amount: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Total Amount</div>
                    <div className="text-lg font-semibold text-foreground">
                      AED {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{days} days</div>
                    <div>{form.rate_type.toLowerCase()} rate</div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving || docExpiredWarnings.length > 0}>{saving ? "Creating..." : "Create Contract"}</Button>
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
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No contracts match this filter.</div>
            ) : (
              paginatedContracts.map((c) => {
                const d = diffDays(c.start_date, c.end_date);
                const balance = Math.max(0, Number(c.total_amount) - Number(c.paid_amount || 0));
                const clientName = c.clients?.full_name ?? "-";
                return (
                  <div key={c.id} className="px-1.5">
                    <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(72px,0.8fr)_auto] items-center gap-2 rounded-lg border border-border/70 bg-card/80 px-2.5 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-[11px] font-semibold text-muted-foreground">
                          {getClientInitials(clientName)}
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm font-semibold leading-4 text-foreground"
                            onClick={() => navigate(`/contracts/${c.id}`)}
                          >
                            {clientName}
                          </button>
                          <div className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                            <span className="font-mono text-foreground">{c.cars?.plate ?? "-"}</span>
                            {c.cars && <span> - {c.cars.make} {c.cars.model}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 text-xs text-muted-foreground">
                        <div className="truncate font-mono text-[11px] leading-4">
                          {formatMobileDate(c.start_date)} - {formatMobileDate(c.end_date)}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] leading-4">
                          <CalendarDays className="h-3 w-3" />
                          <span>{d} days</span>
                        </div>
                      </div>

                      <div className="flex min-w-[82px] items-center justify-end gap-1.5">
                        <div className="min-w-0 text-right">
                          <span className={cn("inline-flex rounded-full px-2 py-[1px] text-[10px] font-medium", getMobileStatusClass(c.status))}>
                            {getMobileStatusLabel(c.status)}
                          </span>
                          <div className={cn("mt-1 whitespace-nowrap font-mono text-sm font-semibold leading-4", balance > 0 ? "text-tint-rose-foreground" : "text-tint-green-foreground")}>
                            AED {balance.toLocaleString()}
                          </div>
                          <div className="mt-0.5 text-[10px] leading-3 text-muted-foreground">
                            {balance > 0 ? "Due" : "Paid"}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0"
                              aria-label="Contract actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  await generateContractPdf(c);
                                  toast.success("Contract PDF downloaded");
                                } catch (err) {
                                  toast.error("Failed to generate PDF");
                                  console.error(err);
                                }
                              }}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download PDF
                            </DropdownMenuItem>
                            {c.status === "closed" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setReopenTargetId(c.id);
                                  setReopenConfirmOpen(true);
                                }}
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Reopen
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
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
                <TableHead className="px-5 text-xs text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">Loading contracts...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">No contracts match this filter.</TableCell>
                </TableRow>
              ) : (
                paginatedContracts.map((c) => {
                  const d = diffDays(c.start_date, c.end_date);
                  const balance = Math.max(0, Number(c.total_amount) - Number(c.paid_amount || 0));
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
                      <TableCell className="text-sm text-muted-foreground">{formatDateWithTime(c.end_date, c.end_time)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {Number(c.total_amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[c.status] ?? "bg-muted text-muted-foreground")}>
                          {c.status}
                        </span>
                      </TableCell>
                      <TableCell className={cn("px-5 text-sm font-medium", balance > 0 ? "text-tint-rose-foreground" : "text-tint-green-foreground")}>
                        AED {balance.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs"
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
                            <Download className="h-3.5 w-3.5" />
                            Download
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
              setForm(emptyForm);
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
