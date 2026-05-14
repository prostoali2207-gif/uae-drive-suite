import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Download, Check, ChevronsUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
import { NationalityCombobox } from "@/components/NationalityCombobox";
import { ClientTypeFields, ClientType } from "@/components/ClientTypeFields";
import { toast } from "sonner";

type ContractStatus = "Active" | "Expiring Soon" | "Overdue" | "Completed";
type PaymentStatus = "Paid" | "Partial" | "Unpaid";
type RateType = "Daily" | "Monthly" | "Yearly";
type FuelLevel = "Empty" | "Quarter" | "Half" | "Three Quarters" | "Full";

interface ContractRow {
  id: string;
  client_id: string;
  car_id: string;
  start_date: string;
  start_time?: string;
  end_date: string;
  end_time?: string;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  initial_mileage: number;
  fuel_level: string;
  status: string;
  payment_status: string;
  paid_amount?: number;
  clients: { full_name: string; phone: string; nationality: string; client_type: string; emirates_id: string | null; passport_number: string | null } | null;
  cars: { plate: string; make: string; model: string; year: number } | null;
}

interface ClientOption { id: string; full_name: string; }
interface CarOption { id: string; plate: string; make: string; model: string; status: string; }

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

const emptyNewClient = {
  full_name: "",
  phone: "",
  client_type: "Resident" as ClientType,
  emirates_id: "",
  emirates_id_expiry: "",
  passport_number: "",
  passport_expiry: "",
  nationality: "",
  license_number: "",
  license_expiry: "",
};

const emptyForm = {
  client_id: "",
  car_id: "",
  start_date: "",
  start_time: "12:00",
  end_date: "",
  end_time: "12:00",
  rate_type: "Daily",
  rate_amount: 100,
  deposit_amount: 0,
  initial_mileage: 0,
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
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [newClient, setNewClient] = useState(emptyNewClient);
  const [clientSelectOpen, setClientSelectOpen] = useState(false);
  const [carSelectOpen, setCarSelectOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [carSearch, setCarSearch] = useState("");
  const [sortBy, setSortBy] = useState<"client" | "car" | "start" | "balance">("start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  const counts = useMemo(() => {
    const base: Record<string, number> = { All: contracts.length, Active: 0, "Expiring Soon": 0, Overdue: 0 };
    contracts.forEach((c) => { if (c.status in base) base[c.status]++; });
    return base;
  }, [contracts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting contract form...", { form, clientMode, newClient });

    if (!form.car_id) {
      toast.error("Please select a car");
      return;
    }

    if (!form.start_date || !form.end_date) {
      toast.error("Please select start and end dates");
      return;
    }

    let clientId = form.client_id;

    if (clientMode === "new") {
      if (!newClient.full_name.trim()) {
        toast.error("Enter the new client's full name");
        return;
      }
      setSaving(true);
      try {
        const { data: created, error: clientErr } = await supabase
          .from("clients")
          .insert({
            full_name: newClient.full_name.trim(),
            phone: newClient.phone.trim(),
            client_type: newClient.client_type,
            emirates_id: newClient.client_type === "Resident" ? newClient.emirates_id.trim() : "",
            emirates_id_expiry: newClient.client_type === "Resident" ? (newClient.emirates_id_expiry || null) : null,
            passport_number: newClient.client_type === "Tourist" ? newClient.passport_number.trim() : "",
            passport_expiry: newClient.client_type === "Tourist" ? (newClient.passport_expiry || null) : null,
            nationality: newClient.nationality.trim(),
            license_number: newClient.license_number.trim(),
            license_expiry: newClient.license_expiry || null,
          })
          .select("id")
          .single();

        if (clientErr || !created) {
          setSaving(false);
          toast.error("Failed to create client: " + toSupabaseMessage(clientErr));
          console.error("Client creation error:", clientErr);
          return;
        }
        clientId = created.id;
      } catch (err) {
        setSaving(false);
        toast.error("An unexpected error occurred while creating client");
        console.error(err);
        return;
      }
    } else {
      if (!clientId) {
        toast.error("Please select an existing client or create a new one");
        return;
      }
      setSaving(true);
    }

    try {

      const { error } = await supabase.from("contracts").insert({
        client_id: clientId,
        car_id: form.car_id,
        start_date: form.start_date,
        end_date: form.end_date,
        rate_type: form.rate_type,
        rate_amount: Number(form.rate_amount),
        total_amount: total,
        deposit_amount: Number(form.deposit_amount),
        initial_mileage: Number(form.initial_mileage),
        fuel_level: form.fuel_level,
        status: "Active",
        payment_status: "Unpaid",
      });

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

        toast.success(clientMode === "new" ? "Client and contract created" : "Contract created");
        setForm(emptyForm);
        setEndTimeManuallyEdited(false);
        setClientSearch("");
        setCarSearch("");
        setNewClient(emptyNewClient);
        setClientMode("existing");
        setOpen(false);
        fetchData();
      }
    } catch (err) {
      setSaving(false);
      toast.error("An unexpected error occurred while creating contract");
      console.error(err);
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

          <Dialog open={open} onOpenChange={setOpen}>
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
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm">Client</Label>
                    <div className="inline-flex rounded-lg border border-border bg-card p-1">
                      {(["existing", "new"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setClientMode(m)}
                          className={cn(
                            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                            clientMode === m
                              ? "bg-foreground text-background"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {m === "existing" ? "Existing Client" : "New Client"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {clientMode === "existing" ? (
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
                                    setForm({ ...form, client_id: c.id });
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
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="nc-name" className="text-xs">Full Name</Label>
                        <Input id="nc-name" required value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="nc-phone" className="text-xs">Phone</Label>
                        <Input id="nc-phone" required value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="nc-nat" className="text-xs">Nationality</Label>
                        <NationalityCombobox
                          id="nc-nat"
                          value={newClient.nationality}
                          onChange={(v) => setNewClient({ ...newClient, nationality: v })}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="nc-lic" className="text-xs">License Number</Label>
                        <Input id="nc-lic" required value={newClient.license_number} onChange={(e) => setNewClient({ ...newClient, license_number: e.target.value })} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="nc-licexp" className="text-xs">License Expiry</Label>
                        <Input id="nc-licexp" type="date" value={newClient.license_expiry} onChange={(e) => setNewClient({ ...newClient, license_expiry: e.target.value })} />
                      </div>
                      <ClientTypeFields
                        idPrefix="nc"
                        compact
                        value={{
                          client_type: newClient.client_type,
                          emirates_id: newClient.emirates_id,
                          emirates_id_expiry: newClient.emirates_id_expiry,
                          passport_number: newClient.passport_number,
                          passport_expiry: newClient.passport_expiry,
                        }}
                        onChange={(v) => setNewClient({ ...newClient, ...v })}
                      />
                    </div>
                  )}
                </div>
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
                                  setForm({ ...form, car_id: c.id });
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
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="start">Start Date</Label>
                    <Input id="start" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="end">End Date</Label>
                    <Input id="end" type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
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
                        setForm({ ...form, end_time: e.target.value });
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
                      onFocus={(e) => {
                        if (Number(form.initial_mileage) === 0) e.currentTarget.select();
                      }}
                      onChange={(e) => setForm({ ...form, initial_mileage: Number(e.target.value) })}
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
                  <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Contract"}</Button>
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
                filtered.map((c) => {
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
                      <TableCell className="text-sm text-muted-foreground">{formatDate(c.start_date)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(c.end_date)}</TableCell>
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
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Contracts;
