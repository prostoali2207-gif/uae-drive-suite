import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ContractForm, type ClientOption, type NewClientInput } from "@/components/ContractForm";

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
  const [clientList, setClientList] = useState<ClientOption[]>(clients);
  const [filter, setFilter] = useState<"All" | ContractStatus>("All");
  const [open, setOpen] = useState(false);

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

  const handleCreateClient = (input: NewClientInput): ClientOption => {
    const created: ClientOption = { id: crypto.randomUUID(), name: input.fullName.trim() };
    setClientList((prev) => [...prev, created]);
    return created;
  };

  const handleSubmit = (values: Parameters<React.ComponentProps<typeof ContractForm>["onSubmit"]>[0]) => {
    const client = clientList.find((c) => c.id === values.clientId);
    const car = cars.find((c) => c.id === values.carId);
    if (!client || !car) return;
    const nextNum = `CT-${1042 + contracts.length + 1}`;
    const dailyEquivalent = values.durationDays > 0 ? values.total / values.durationDays : values.rate;
    setContracts((prev) => [
      {
        id: crypto.randomUUID(),
        number: nextNum,
        clientName: client.name,
        carPlate: car.plate,
        carModel: car.model,
        startDate: values.startDate,
        endDate: values.endDate,
        dailyRate: Math.round(dailyEquivalent),
        paymentStatus: "Unpaid",
      },
      ...prev,
    ]);
    setOpen(false);
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
              {open && (
                <ContractForm
                  clients={clientList}
                  cars={cars}
                  onSubmit={handleSubmit}
                  onCancel={() => setOpen(false)}
                  onCreateClient={handleCreateClient}
                />
              )}
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
