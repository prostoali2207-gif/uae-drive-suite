import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";

type ContractStatus = "Active" | "Expiring Soon" | "Overdue" | "Completed";
type PaymentStatus = "Paid" | "Partial" | "Unpaid";

interface Client {
  id: string;
  name: string;
}

interface Car {
  id: string;
  plate: string;
  model: string;
  available: boolean;
}

interface Contract {
  id: string;
  number: string;
  clientName: string;
  carPlate: string;
  carModel: string;
  startDate: string;
  endDate: string;
  dailyRate: number;
  paymentStatus: PaymentStatus;
}

const clients: Client[] = [
  { id: "c1", name: "Ahmed Al Mansoori" },
  { id: "c2", name: "Sara Hassan" },
  { id: "c3", name: "Layla Ibrahim" },
  { id: "c4", name: "Omar Saeed" },
  { id: "c5", name: "Fatima Al Zaabi" },
  { id: "c6", name: "Khalid Rahman" },
];

const cars: Car[] = [
  { id: "v1", plate: "DXB A 12345", model: "Toyota Corolla", available: false },
  { id: "v2", plate: "DXB F 87231", model: "Nissan Sunny", available: false },
  { id: "v3", plate: "AUH B 44120", model: "Hyundai Elantra", available: true },
  { id: "v4", plate: "DXB N 55891", model: "Kia Pegas", available: false },
  { id: "v5", plate: "DXB K 09812", model: "Toyota Yaris", available: true },
  { id: "v6", plate: "AUH C 30021", model: "Nissan Kicks", available: true },
];

const initialContracts: Contract[] = [
  { id: "1", number: "CT-1042", clientName: "Ahmed Al Mansoori", carPlate: "DXB A 12345", carModel: "Toyota Corolla", startDate: "2026-03-15", endDate: "2026-04-22", dailyRate: 120, paymentStatus: "Paid" },
  { id: "2", number: "CT-1041", clientName: "Sara Hassan", carPlate: "DXB F 87231", carModel: "Nissan Sunny", startDate: "2026-04-01", endDate: "2026-04-25", dailyRate: 95, paymentStatus: "Partial" },
  { id: "3", number: "CT-1040", clientName: "Layla Ibrahim", carPlate: "DXB N 55891", carModel: "Kia Pegas", startDate: "2026-04-05", endDate: "2026-05-10", dailyRate: 110, paymentStatus: "Paid" },
  { id: "4", number: "CT-1039", clientName: "Omar Saeed", carPlate: "DXB Q 71234", carModel: "Chevrolet Spark", startDate: "2026-03-20", endDate: "2026-04-15", dailyRate: 80, paymentStatus: "Unpaid" },
  { id: "5", number: "CT-1038", clientName: "Fatima Al Zaabi", carPlate: "AUH B 44120", carModel: "Hyundai Elantra", startDate: "2026-02-10", endDate: "2026-03-12", dailyRate: 130, paymentStatus: "Paid" },
  { id: "6", number: "CT-1037", clientName: "Khalid Rahman", carPlate: "SHJ 1 22019", carModel: "Mitsubishi Attrage", startDate: "2026-04-10", endDate: "2026-04-30", dailyRate: 85, paymentStatus: "Partial" },
];

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function durationDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function deriveStatus(c: Contract): ContractStatus {
  const d = daysUntil(c.endDate);
  if (d < 0) {
    return c.paymentStatus === "Paid" ? "Completed" : "Overdue";
  }
  if (d <= 7) return "Expiring Soon";
  return "Active";
}

const statusClasses: Record<ContractStatus, string> = {
  Active: "bg-tint-blue text-tint-blue-foreground",
  "Expiring Soon": "bg-tint-amber text-tint-amber-foreground",
  Overdue: "bg-tint-rose text-tint-rose-foreground",
  Completed: "bg-muted text-muted-foreground",
};

const paymentClasses: Record<PaymentStatus, string> = {
  Paid: "bg-tint-green text-tint-green-foreground",
  Partial: "bg-tint-amber text-tint-amber-foreground",
  Unpaid: "bg-tint-rose text-tint-rose-foreground",
};

const filters: ("All" | ContractStatus)[] = ["All", "Active", "Expiring Soon", "Overdue"];

const Contracts = () => {
  const [contracts, setContracts] = useState<Contract[]>(initialContracts);
  const [filter, setFilter] = useState<"All" | ContractStatus>("All");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    clientId: "",
    carId: "",
    startDate: "",
    endDate: "",
    dailyRate: 100,
  });

  const enriched = useMemo(
    () => contracts.map((c) => ({ ...c, status: deriveStatus(c) })),
    [contracts],
  );

  const counts = useMemo(() => {
    const base = { All: enriched.length, Active: 0, "Expiring Soon": 0, Overdue: 0 } as Record<string, number>;
    enriched.forEach((c) => {
      if (c.status in base) base[c.status]++;
    });
    return base;
  }, [enriched]);

  const filtered = useMemo(
    () => (filter === "All" ? enriched : enriched.filter((c) => c.status === filter)),
    [enriched, filter],
  );

  const formDuration = useMemo(
    () => (form.startDate && form.endDate ? durationDays(form.startDate, form.endDate) : 0),
    [form.startDate, form.endDate],
  );
  const formTotal = formDuration * Number(form.dailyRate || 0);

  const availableCars = cars.filter((c) => c.available);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === form.clientId);
    const car = cars.find((c) => c.id === form.carId);
    if (!client || !car) return;
    const nextNum = `CT-${1042 + contracts.length + 1}`;
    setContracts((prev) => [
      {
        id: crypto.randomUUID(),
        number: nextNum,
        clientName: client.name,
        carPlate: car.plate,
        carModel: car.model,
        startDate: form.startDate,
        endDate: form.endDate,
        dailyRate: Number(form.dailyRate),
        paymentStatus: "Unpaid",
      },
      ...prev,
    ]);
    setOpen(false);
    setForm({ clientId: "", carId: "", startDate: "", endDate: "", dailyRate: 100 });
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
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Create new contract</DialogTitle>
                <DialogDescription>Total amount is calculated automatically.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="client">Client</Label>
                  <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                    <SelectTrigger id="client">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="car">Car (Available only)</Label>
                  <Select value={form.carId} onValueChange={(v) => setForm({ ...form, carId: v })}>
                    <SelectTrigger id="car">
                      <SelectValue placeholder="Select a car" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCars.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.plate} — {c.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="start">Start Date</Label>
                    <Input
                      id="start"
                      type="date"
                      required
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="end">End Date</Label>
                    <Input
                      id="end"
                      type="date"
                      required
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="rate">Daily Rate (AED)</Label>
                    <Input
                      id="rate"
                      type="number"
                      min={0}
                      required
                      value={form.dailyRate}
                      onChange={(e) => setForm({ ...form, dailyRate: Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Total Amount</Label>
                    <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium text-foreground">
                      AED {formTotal.toLocaleString()}
                      <span className="ml-2 text-xs text-muted-foreground">({formDuration} days)</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Contract</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Contract #</TableHead>
                <TableHead className="text-xs">Client</TableHead>
                <TableHead className="text-xs">Car</TableHead>
                <TableHead className="text-xs">Start</TableHead>
                <TableHead className="text-xs">End</TableHead>
                <TableHead className="text-xs">Days</TableHead>
                <TableHead className="text-xs">Rate</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="px-5 text-xs">Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-sm text-muted-foreground">
                    No contracts match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const days = durationDays(c.startDate, c.endDate);
                  const total = days * c.dailyRate;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="px-5 font-mono text-xs text-foreground">{c.number}</TableCell>
                      <TableCell className="font-medium text-foreground">{c.clientName}</TableCell>
                      <TableCell>
                        <div className="font-mono text-xs text-foreground">{c.carPlate}</div>
                        <div className="text-xs text-muted-foreground">{c.carModel}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(c.startDate)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(c.endDate)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{days}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">AED {c.dailyRate}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {total.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[c.status])}>
                          {c.status}
                        </span>
                      </TableCell>
                      <TableCell className="px-5">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", paymentClasses[c.paymentStatus])}>
                          {c.paymentStatus}
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
