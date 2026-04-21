import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
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
  end_date: string;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  initial_mileage: number;
  fuel_level: string;
  status: string;
  payment_status: string;
  clients: { full_name: string } | null;
  cars: { plate: string; make: string; model: string } | null;
}

interface ClientOption { id: string; full_name: string; }
interface CarOption { id: string; plate: string; make: string; model: string; status: string; }

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

const emptyForm = {
  client_id: "",
  car_id: "",
  start_date: "",
  end_date: "",
  rate_type: "Daily" as RateType,
  rate_amount: 100,
  deposit_amount: 0,
  initial_mileage: 0,
  fuel_level: "Full" as FuelLevel,
  special_conditions: "",
};

const Contracts = () => {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | ContractStatus>("All");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const fetchData = async () => {
    const [contractsRes, clientsRes, carsRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("*, clients(full_name), cars(plate, make, model)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
      supabase.from("cars").select("id, plate, make, model, status").order("plate"),
    ]);
    if (contractsRes.error) toast.error("Failed to load contracts");
    else setContracts((contractsRes.data as ContractRow[]) || []);
    if (!clientsRes.error) setClients(clientsRes.data || []);
    if (!carsRes.error) setCars(carsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const availableCars = useMemo(() => cars.filter((c) => c.status === "Available"), [cars]);

  const days = useMemo(() => diffDays(form.start_date, form.end_date), [form.start_date, form.end_date]);
  const total = useMemo(() => {
    if (!form.rate_amount || !days) return 0;
    if (form.rate_type === "Daily") return form.rate_amount * days;
    if (form.rate_type === "Monthly") return form.rate_amount * (days / 30);
    return form.rate_amount * (days / 365);
  }, [form.rate_type, form.rate_amount, days]);

  const filtered = useMemo(
    () => (filter === "All" ? contracts : contracts.filter((c) => c.status === filter)),
    [contracts, filter],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = { All: contracts.length, Active: 0, "Expiring Soon": 0, Overdue: 0 };
    contracts.forEach((c) => { if (c.status in base) base[c.status]++; });
    return base;
  }, [contracts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id || !form.car_id) return;
    setSaving(true);
    const { error } = await supabase.from("contracts").insert({
      client_id: form.client_id,
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
      toast.error("Failed to create contract: " + error.message);
    } else {
      toast.success("Contract created");
      setForm(emptyForm);
      setOpen(false);
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
                <div className="grid gap-1.5">
                  <Label>Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Car (Available only)</Label>
                  <Select value={form.car_id} onValueChange={(v) => setForm({ ...form, car_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select a car" /></SelectTrigger>
                    <SelectContent>
                      {availableCars.map((c) => <SelectItem key={c.id} value={c.id}>{c.plate} — {c.make} {c.model}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                    <Input id="rate" type="number" min={0} required value={form.rate_amount} onChange={(e) => setForm({ ...form, rate_amount: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="mileage">Initial Mileage (km)</Label>
                    <Input id="mileage" type="number" min={0} value={form.initial_mileage} onChange={(e) => setForm({ ...form, initial_mileage: Number(e.target.value) })} />
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
                  <Input id="deposit" type="number" min={0} value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: Number(e.target.value) })} />
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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Client</TableHead>
                <TableHead className="text-xs">Car</TableHead>
                <TableHead className="text-xs">Start</TableHead>
                <TableHead className="text-xs">End</TableHead>
                <TableHead className="text-xs">Days</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="px-5 text-xs">Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">Loading contracts...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">No contracts match this filter.</TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const d = diffDays(c.start_date, c.end_date);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="px-5 font-medium text-foreground">{c.clients?.full_name ?? "—"}</TableCell>
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
                      <TableCell className="px-5">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", paymentClasses[c.payment_status] ?? "bg-muted text-muted-foreground")}>
                          {c.payment_status}
                        </span>
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
