import { useMemo, useState } from "react";
import { Plus, AlertTriangle, Wallet } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { initialClients, formatDate } from "@/data/clients";

type FineType = "Speeding" | "Parking" | "Signal" | "Other";
type FineSource = "Dubai Police" | "Abu Dhabi Police" | "Sharjah";
type ChargeStatus = "Unpaid" | "Charged to Client" | "Paid";

interface Fine {
  id: string;
  date: string;
  carPlate: string;
  clientId: string;
  clientName: string;
  type: FineType;
  amount: number;
  source: FineSource;
  status: ChargeStatus;
  notes?: string;
}

interface SalikCharge {
  id: string;
  date: string;
  carPlate: string;
  clientId: string;
  clientName: string;
  trips: number;
  amount: number;
  status: ChargeStatus;
}

const cars = [
  { plate: "DXB A 12345", model: "Toyota Corolla" },
  { plate: "DXB F 87231", model: "Nissan Sunny" },
  { plate: "AUH B 44120", model: "Hyundai Elantra" },
  { plate: "DXB N 55891", model: "Kia Pegas" },
  { plate: "DXB K 09812", model: "Toyota Yaris" },
  { plate: "SHJ 1 22019", model: "Mitsubishi Attrage" },
];

const initialFines: Fine[] = [
  { id: "f1", date: "2026-04-12", carPlate: "DXB A 12345", clientId: "c1", clientName: "Ahmed Al Mansoori", type: "Speeding", amount: 600, source: "Dubai Police", status: "Unpaid", notes: "Sheikh Zayed Rd, 132 km/h zone." },
  { id: "f2", date: "2026-04-08", carPlate: "DXB F 87231", clientId: "c2", clientName: "Sara Hassan", type: "Parking", amount: 200, source: "Dubai Police", status: "Charged to Client" },
  { id: "f3", date: "2026-04-02", carPlate: "AUH B 44120", clientId: "c5", clientName: "Fatima Al Zaabi", type: "Signal", amount: 1000, source: "Abu Dhabi Police", status: "Paid" },
  { id: "f4", date: "2026-03-28", carPlate: "DXB Q 71234", clientId: "c4", clientName: "Omar Saeed", type: "Speeding", amount: 400, source: "Dubai Police", status: "Unpaid" },
  { id: "f5", date: "2026-03-22", carPlate: "SHJ 1 22019", clientId: "c6", clientName: "Khalid Rahman", type: "Other", amount: 300, source: "Sharjah", status: "Unpaid", notes: "Tinted window." },
];

const initialSalik: SalikCharge[] = [
  { id: "s1", date: "2026-04-15", carPlate: "DXB A 12345", clientId: "c1", clientName: "Ahmed Al Mansoori", trips: 8, amount: 32, status: "Charged to Client" },
  { id: "s2", date: "2026-04-14", carPlate: "DXB F 87231", clientId: "c2", clientName: "Sara Hassan", trips: 4, amount: 16, status: "Unpaid" },
  { id: "s3", date: "2026-04-10", carPlate: "DXB N 55891", clientId: "c3", clientName: "Layla Ibrahim", trips: 12, amount: 48, status: "Paid" },
  { id: "s4", date: "2026-04-09", carPlate: "DXB K 09812", clientId: "c4", clientName: "Omar Saeed", trips: 6, amount: 24, status: "Unpaid" },
];

const SALIK_BALANCE = 1240;

const fineTypes: FineType[] = ["Speeding", "Parking", "Signal", "Other"];
const fineSources: FineSource[] = ["Dubai Police", "Abu Dhabi Police", "Sharjah"];

const statusClasses: Record<ChargeStatus, string> = {
  Unpaid: "bg-tint-rose text-tint-rose-foreground",
  "Charged to Client": "bg-tint-amber text-tint-amber-foreground",
  Paid: "bg-tint-green text-tint-green-foreground",
};

const Fines = () => {
  const [fines, setFines] = useState<Fine[]>(initialFines);
  const [salik, setSalik] = useState<SalikCharge[]>(initialSalik);
  const [fineOpen, setFineOpen] = useState(false);
  const [salikOpen, setSalikOpen] = useState(false);

  const [fineForm, setFineForm] = useState({
    date: "",
    carPlate: "",
    clientId: "",
    type: "Speeding" as FineType,
    amount: 0,
    source: "Dubai Police" as FineSource,
    notes: "",
  });

  const [salikForm, setSalikForm] = useState({
    date: "",
    carPlate: "",
    clientId: "",
    trips: 0,
    amount: 0,
  });

  const totalUnpaidFines = useMemo(
    () => fines.filter((f) => f.status === "Unpaid").reduce((s, f) => s + f.amount, 0),
    [fines],
  );

  const totalUnpaidSalik = useMemo(
    () => salik.filter((s) => s.status === "Unpaid").reduce((sum, s) => sum + s.amount, 0),
    [salik],
  );

  const chargeFineToClient = (id: string) => {
    setFines((prev) => prev.map((f) => f.id === id ? { ...f, status: "Charged to Client" } : f));
    toast.success("Fine charged to client's outstanding balance");
  };

  const chargeSalikToClient = (id: string) => {
    setSalik((prev) => prev.map((s) => s.id === id ? { ...s, status: "Charged to Client" } : s));
    toast.success("Salik charge added to client's outstanding balance");
  };

  const handleAddFine = (e: React.FormEvent) => {
    e.preventDefault();
    const client = initialClients.find((c) => c.id === fineForm.clientId);
    if (!client || !fineForm.carPlate || !fineForm.date) return;
    setFines((prev) => [
      {
        id: crypto.randomUUID(),
        date: fineForm.date,
        carPlate: fineForm.carPlate,
        clientId: client.id,
        clientName: client.name,
        type: fineForm.type,
        amount: Number(fineForm.amount),
        source: fineForm.source,
        status: "Unpaid",
        notes: fineForm.notes.trim() || undefined,
      },
      ...prev,
    ]);
    setFineForm({ date: "", carPlate: "", clientId: "", type: "Speeding", amount: 0, source: "Dubai Police", notes: "" });
    setFineOpen(false);
  };

  const handleAddSalik = (e: React.FormEvent) => {
    e.preventDefault();
    const client = initialClients.find((c) => c.id === salikForm.clientId);
    if (!client || !salikForm.carPlate || !salikForm.date) return;
    setSalik((prev) => [
      {
        id: crypto.randomUUID(),
        date: salikForm.date,
        carPlate: salikForm.carPlate,
        clientId: client.id,
        clientName: client.name,
        trips: Number(salikForm.trips),
        amount: Number(salikForm.amount),
        status: "Unpaid",
      },
      ...prev,
    ]);
    setSalikForm({ date: "", carPlate: "", clientId: "", trips: 0, amount: 0 });
    setSalikOpen(false);
  };

  return (
    <DashboardLayout title="Fines & Salik" subtitle="Traffic fines and toll charges">
      <Tabs defaultValue="fines" className="flex flex-col gap-5">
        <TabsList className="w-fit">
          <TabsTrigger value="fines">Traffic Fines</TabsTrigger>
          <TabsTrigger value="salik">Salik Charges</TabsTrigger>
        </TabsList>

        {/* TRAFFIC FINES */}
        <TabsContent value="fines" className="m-0 flex flex-col gap-4">
          {totalUnpaidFines > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-tint-rose-foreground/20 bg-tint-rose px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-tint-rose-foreground" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-tint-rose-foreground">
                  AED {totalUnpaidFines.toLocaleString()} in unpaid fines
                </div>
                <div className="text-xs text-tint-rose-foreground/80">
                  {fines.filter((f) => f.status === "Unpaid").length} fines awaiting action
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end">
            <Dialog open={fineOpen} onOpenChange={setFineOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Fine
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>Add traffic fine</DialogTitle>
                  <DialogDescription>Manually record a new fine for a vehicle.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddFine} className="grid gap-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="f-date">Date</Label>
                      <Input id="f-date" type="date" required value={fineForm.date} onChange={(e) => setFineForm({ ...fineForm, date: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Car</Label>
                      <Select value={fineForm.carPlate} onValueChange={(v) => setFineForm({ ...fineForm, carPlate: v })}>
                        <SelectTrigger><SelectValue placeholder="Select car" /></SelectTrigger>
                        <SelectContent>
                          {cars.map((c) => <SelectItem key={c.plate} value={c.plate}>{c.plate} — {c.model}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 grid gap-1.5">
                      <Label>Client</Label>
                      <Select value={fineForm.clientId} onValueChange={(v) => setFineForm({ ...fineForm, clientId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {initialClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Fine Type</Label>
                      <Select value={fineForm.type} onValueChange={(v) => setFineForm({ ...fineForm, type: v as FineType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {fineTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="f-amt">Amount (AED)</Label>
                      <Input id="f-amt" type="number" min={0} required value={fineForm.amount} onChange={(e) => setFineForm({ ...fineForm, amount: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-2 grid gap-1.5">
                      <Label>Source</Label>
                      <Select value={fineForm.source} onValueChange={(v) => setFineForm({ ...fineForm, source: v as FineSource })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {fineSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 grid gap-1.5">
                      <Label htmlFor="f-notes">Notes</Label>
                      <Textarea id="f-notes" rows={2} value={fineForm.notes} onChange={(e) => setFineForm({ ...fineForm, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setFineOpen(false)}>Cancel</Button>
                    <Button type="submit">Add Fine</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-5 text-xs">Date</TableHead>
                  <TableHead className="text-xs">Car</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                  <TableHead className="px-5 text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">No fines recorded.</TableCell>
                  </TableRow>
                ) : (
                  fines.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="px-5 text-sm text-muted-foreground">{formatDate(f.date)}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{f.carPlate}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{f.clientName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{f.type}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {f.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{f.source}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[f.status])}>
                          {f.status}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">{f.notes || "—"}</TableCell>
                      <TableCell className="px-5 text-right">
                        {f.status === "Unpaid" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => chargeFineToClient(f.id)}>
                            Charge to Client
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* SALIK */}
        <TabsContent value="salik" className="m-0 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tint-blue text-tint-blue-foreground">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Current Salik Balance</div>
              <div className="text-base font-semibold text-foreground">AED {SALIK_BALANCE.toLocaleString()}</div>
            </div>
            {totalUnpaidSalik > 0 && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Unpaid charges</div>
                <div className="text-sm font-semibold text-tint-rose-foreground">AED {totalUnpaidSalik.toLocaleString()}</div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end">
            <Dialog open={salikOpen} onOpenChange={setSalikOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Salik Charges
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Add Salik charges</DialogTitle>
                  <DialogDescription>Record toll charges for a vehicle.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddSalik} className="grid gap-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="s-date">Date</Label>
                      <Input id="s-date" type="date" required value={salikForm.date} onChange={(e) => setSalikForm({ ...salikForm, date: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Car</Label>
                      <Select value={salikForm.carPlate} onValueChange={(v) => setSalikForm({ ...salikForm, carPlate: v })}>
                        <SelectTrigger><SelectValue placeholder="Select car" /></SelectTrigger>
                        <SelectContent>
                          {cars.map((c) => <SelectItem key={c.plate} value={c.plate}>{c.plate} — {c.model}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 grid gap-1.5">
                      <Label>Client</Label>
                      <Select value={salikForm.clientId} onValueChange={(v) => setSalikForm({ ...salikForm, clientId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {initialClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="s-trips">Number of Trips</Label>
                      <Input id="s-trips" type="number" min={0} required value={salikForm.trips} onChange={(e) => setSalikForm({ ...salikForm, trips: Number(e.target.value) })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="s-amt">Amount (AED)</Label>
                      <Input id="s-amt" type="number" min={0} required value={salikForm.amount} onChange={(e) => setSalikForm({ ...salikForm, amount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setSalikOpen(false)}>Cancel</Button>
                    <Button type="submit">Add Charges</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-5 text-xs">Date</TableHead>
                  <TableHead className="text-xs">Car</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Trips</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="px-5 text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salik.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">No Salik charges recorded.</TableCell>
                  </TableRow>
                ) : (
                  salik.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="px-5 text-sm text-muted-foreground">{formatDate(s.date)}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{s.carPlate}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{s.clientName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.trips}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {s.amount.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[s.status])}>
                          {s.status}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 text-right">
                        {s.status === "Unpaid" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => chargeSalikToClient(s.id)}>
                            Charge to Client
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default Fines;
