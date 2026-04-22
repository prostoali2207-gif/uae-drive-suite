import { useEffect, useMemo, useState } from "react";
import { Plus, TriangleAlert as AlertTriangle, Wallet } from "lucide-react";
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
import { supabase } from "@/lib/supabase";

type ChargeStatus = "Unpaid" | "Charged to Client" | "Paid";

interface FineRow {
  id: string;
  fine_date: string;
  fine_type: string;
  amount: number;
  source: string;
  status: string;
  notes: string | null;
  car_id: string | null;
  client_id: string | null;
  cars: { plate: string } | null;
  clients: { full_name: string } | null;
}

interface SalikRow {
  id: string;
  charge_date: string;
  trips: number;
  amount: number;
  status: string;
  car_id: string | null;
  client_id: string | null;
  cars: { plate: string } | null;
  clients: { full_name: string } | null;
}

interface CarOption { id: string; plate: string; make: string; model: string; }
interface ClientOption { id: string; full_name: string; }

const SALIK_BALANCE = 1240;

const fineTypes = ["Speeding", "Parking", "Signal", "Phone Use", "Other"];
const fineSources = ["Dubai Police", "Abu Dhabi Police", "Sharjah Police", "RTA"];

const statusClasses: Record<string, string> = {
  Unpaid: "bg-tint-rose text-tint-rose-foreground",
  "Charged to Client": "bg-tint-amber text-tint-amber-foreground",
  "Paid by Client": "bg-tint-green text-tint-green-foreground",
  "Paid by Company": "bg-tint-blue text-tint-blue-foreground",
  Paid: "bg-tint-green text-tint-green-foreground",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const Fines = () => {
  const [fines, setFines] = useState<FineRow[]>([]);
  const [salik, setSalik] = useState<SalikRow[]>([]);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fineOpen, setFineOpen] = useState(false);
  const [salikOpen, setSalikOpen] = useState(false);

  const [fineForm, setFineForm] = useState({
    fine_date: "",
    car_id: "",
    client_id: "",
    fine_type: "Speeding",
    amount: 0,
    source: "Dubai Police",
    notes: "",
  });

  const [salikForm, setSalikForm] = useState({
    charge_date: "",
    car_id: "",
    client_id: "",
    trips: 0,
    amount: 0,
  });

  const fetchData = async () => {
    const [finesRes, salikRes, carsRes, clientsRes] = await Promise.all([
      supabase
        .from("fines")
        .select("*, cars(plate), clients(full_name)")
        .order("fine_date", { ascending: false }),
      supabase
        .from("salik")
        .select("*, cars(plate), clients(full_name)")
        .order("charge_date", { ascending: false }),
      supabase.from("cars").select("id, plate, make, model").order("plate"),
      supabase.from("clients").select("id, full_name").order("full_name"),
    ]);
    if (!finesRes.error) setFines((finesRes.data as FineRow[]) || []);
    if (!salikRes.error) setSalik((salikRes.data as SalikRow[]) || []);
    if (!carsRes.error) setCars(carsRes.data || []);
    if (!clientsRes.error) setClients(clientsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const totalUnpaidFines = useMemo(
    () => fines.filter((f) => f.status === "Unpaid").reduce((s, f) => s + Number(f.amount), 0),
    [fines],
  );

  const totalUnpaidSalik = useMemo(
    () => salik.filter((s) => s.status === "Unpaid").reduce((sum, s) => sum + Number(s.amount), 0),
    [salik],
  );

  const chargeFineToClient = async (id: string) => {
    const { error } = await supabase.from("fines").update({ status: "Charged to Client" }).eq("id", id);
    if (error) {
      toast.error("Failed to update fine");
    } else {
      toast.success("Fine charged to client's outstanding balance");
      setFines((prev) => prev.map((f) => f.id === id ? { ...f, status: "Charged to Client" } : f));
    }
  };

  const chargeSalikToClient = async (id: string) => {
    const { error } = await supabase.from("salik").update({ status: "Charged to Client" }).eq("id", id);
    if (error) {
      toast.error("Failed to update Salik charge");
    } else {
      toast.success("Salik charge added to client's outstanding balance");
      setSalik((prev) => prev.map((s) => s.id === id ? { ...s, status: "Charged to Client" } : s));
    }
  };

  const handleAddFine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fineForm.car_id || !fineForm.client_id || !fineForm.fine_date) return;
    const { error } = await supabase.from("fines").insert({
      fine_date: fineForm.fine_date,
      car_id: fineForm.car_id,
      client_id: fineForm.client_id,
      fine_type: fineForm.fine_type,
      amount: Number(fineForm.amount),
      source: fineForm.source,
      status: "Unpaid",
      notes: fineForm.notes.trim() || null,
    });
    if (error) {
      toast.error("Failed to add fine: " + error.message);
    } else {
      toast.success("Fine added");
      setFineForm({ fine_date: "", car_id: "", client_id: "", fine_type: "Speeding", amount: 0, source: "Dubai Police", notes: "" });
      setFineOpen(false);
      fetchData();
    }
  };

  const handleAddSalik = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salikForm.car_id || !salikForm.client_id || !salikForm.charge_date) return;
    const { error } = await supabase.from("salik").insert({
      charge_date: salikForm.charge_date,
      car_id: salikForm.car_id,
      client_id: salikForm.client_id,
      trips: Number(salikForm.trips),
      amount: Number(salikForm.amount),
      status: "Unpaid",
    });
    if (error) {
      toast.error("Failed to add Salik charge: " + error.message);
    } else {
      toast.success("Salik charges added");
      setSalikForm({ charge_date: "", car_id: "", client_id: "", trips: 0, amount: 0 });
      setSalikOpen(false);
      fetchData();
    }
  };

  return (
    <DashboardLayout title="Fines & Salik" subtitle="Traffic fines and toll charges">
      <Tabs defaultValue="fines" className="flex flex-col gap-5">
        <TabsList className="w-fit">
          <TabsTrigger value="fines">Traffic Fines</TabsTrigger>
          <TabsTrigger value="salik">Salik Charges</TabsTrigger>
        </TabsList>

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
                      <Input id="f-date" type="date" required value={fineForm.fine_date} onChange={(e) => setFineForm({ ...fineForm, fine_date: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Car</Label>
                      <Select value={fineForm.car_id} onValueChange={(v) => setFineForm({ ...fineForm, car_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select car" /></SelectTrigger>
                        <SelectContent>
                          {cars.map((c) => <SelectItem key={c.id} value={c.id}>{c.plate} — {c.make} {c.model}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 grid gap-1.5">
                      <Label>Client</Label>
                      <Select value={fineForm.client_id} onValueChange={(v) => setFineForm({ ...fineForm, client_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Fine Type</Label>
                      <Select value={fineForm.fine_type} onValueChange={(v) => setFineForm({ ...fineForm, fine_type: v })}>
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
                      <Select value={fineForm.source} onValueChange={(v) => setFineForm({ ...fineForm, source: v })}>
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
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">Loading fines...</TableCell>
                  </TableRow>
                ) : fines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">No fines recorded.</TableCell>
                  </TableRow>
                ) : (
                  fines.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="px-5 text-sm text-muted-foreground">{formatDate(f.fine_date)}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{f.cars?.plate ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{f.clients?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{f.fine_type}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {Number(f.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{f.source}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[f.status] ?? "bg-muted text-muted-foreground")}>
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
                      <Input id="s-date" type="date" required value={salikForm.charge_date} onChange={(e) => setSalikForm({ ...salikForm, charge_date: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Car</Label>
                      <Select value={salikForm.car_id} onValueChange={(v) => setSalikForm({ ...salikForm, car_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select car" /></SelectTrigger>
                        <SelectContent>
                          {cars.map((c) => <SelectItem key={c.id} value={c.id}>{c.plate} — {c.make} {c.model}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 grid gap-1.5">
                      <Label>Client</Label>
                      <Select value={salikForm.client_id} onValueChange={(v) => setSalikForm({ ...salikForm, client_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
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
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">Loading Salik charges...</TableCell>
                  </TableRow>
                ) : salik.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">No Salik charges recorded.</TableCell>
                  </TableRow>
                ) : (
                  salik.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="px-5 text-sm text-muted-foreground">{formatDate(s.charge_date)}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{s.cars?.plate ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{s.clients?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.trips}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {Number(s.amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[s.status] ?? "bg-muted text-muted-foreground")}>
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
