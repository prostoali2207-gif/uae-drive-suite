import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Download, Check, ChevronsUpDown, ArrowUp, ArrowDown, Trash2, RotateCcw } from "lucide-react";
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

type ContractStatus = "Active" | "Expiring Soon" | "Overdue" | "Completed";
type PaymentStatus = "Paid" | "Partial" | "Unpaid";
type RateType = "Daily" | "Monthly" | "Yearly";
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
  clients: { full_name: string; phone: string; nationality: string; client_type: string; emirates_id: string | null; passport_number: string | null } | null;
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
};

const paymentClasses: Record<string, string> = {
  Paid: "bg-tint-green text-tint-green-foreground",
  Partial: "bg-tint-amber text-tint-amber-foreground",
  Unpaid: "bg-tint-rose text-tint-rose-foreground",
};

const filters: ("All" | ContractStatus)[] = ["All", "Active", "Expiring Soon", "Overdue"];
const fuelLevels: FuelLevel[] = ["Empty", "Quarter", "Half", "Three Quarters", "Full"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

const Contracts = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | ContractStatus>("All");
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
  const [showSignModal, setShowSignModal] = useState(false);
  const [newContractId, setNewContractId] = useState("");
  const [signingClientName, setSigningClientName] = useState("");
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

    const [contractsRes, clientsRes, carsRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("*, clients(full_name, phone, nationality, client_type, emirates_id, passport_number), cars(plate, make, model, year)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
      supabase.from("cars").select("id, plate, make, model, status").order("plate"),
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

  const days = useMemo(() => diffDays(form.start_date, form.end_date), [form.start_date, form.end_date]);
  const total = useMemo(() => {
    if (!form.rate_amount || !days) return 0;
    if (form.rate_type === "Daily") return form.rate_amount * days;
    if (form.rate_type === "Monthly") {
      if (isAtLeastFullMonth(form.start_date, form.end_date)) return form.rate_amount;
      return form.rate_amount * (days / 30);
    }
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
    const byStatus = filter === "All" ? contracts : contracts.filter((c) => c.status === filter);
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
    const base: Record<string, number> = { All: contracts.length, Active: 0, "Expiring Soon": 0, Overdue: 0 };
    contracts.forEach((c) => { if (c.status in base) base[c.status]++; });
    return base;
  }, [contracts]);

  const handleContractDialogOpenChange = (nextOpen: boolean) => {
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

    if (!form.client_id) {
      toast.error("Please select a client");
      return;
    }

    if (!form.car_id) {
      toast.error("Please select a car");
      return;
    }

    if (!form.start_date || !form.end_date) {
      toast.error("Please select start and end dates");
      return;
    }

    if (String(form.initial_mileage).trim() === "") {
      toast.error("Please enter initial mileage");
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

      const { data: insertedContract, error } = await supabase.from("contracts").insert({
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
      }).select("id").single();

      setSaving(false);
      if (error) {

        toast.error("Failed to create contract: " + toSupabaseMessage(error));
        console.error("Contract creation error:", error);
      } else {
        const { error: carStatusError } = await supabase
          .from("cars")
          .update({ status: "Rented" })
          .eq("id", form.car_id);
        if (carStatusError) {
          console.error("Failed to mark vehicle as rented:", carStatusError);
          toast.error("Contract saved, but vehicle status update failed");
        }

        try {
          await syncVehicleStatusesWithContracts();
        } catch (syncErr) {
          console.error("Vehicle status reconciliation failed:", syncErr);
        }

        const resolvedClientName = clients.find((cl) => cl.id === clientId)?.full_name ?? "";
        toast.success("Contract created");
        setForm(emptyForm);
        setEndTimeManuallyEdited(false);
        setClientSearch("");
        setCarSearch("");
        setOpen(false);
        if (insertedContract) {
          const createdId = (insertedContract as { id: string }).id;
          setNewContractId(createdId);
          setSigningClientName(resolvedClientName);
          setShowSignModal(true);
        }
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
    <DashboardLayout title="Contracts" subtitle="Manage rental agreements">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
            {filters.map((f) => (
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
              <Button size="sm" className="gap-1.5">
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
                    <Select value={form.rate_type} onValueChange={(v) => setForm({ ...form, rate_type: v as RateType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Daily">Daily</SelectItem>
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
                      onChange={(e) => setForm({ ...form, rate_amount: Number(e.target.value) })}
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
                      onChange={(e) => setForm({ ...form, initial_mileage: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Fuel Level</Label>
                    <Select value={form.fuel_level} onValueChange={(v) => setForm({ ...form, fuel_level: v as FuelLevel })}>
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
                    onChange={(e) => setForm({ ...form, deposit_amount: Number(e.target.value) })}
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
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving || docExpiredWarnings.length > 0}>{saving ? "Creating..." : "Create Contract"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client name or car plate"
              className="h-9 max-w-md text-sm"
            />
          </div>
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
      )}
    </DashboardLayout>
  );
};

export default Contracts;
