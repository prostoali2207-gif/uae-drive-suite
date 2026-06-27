import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search, TriangleAlert as AlertTriangle, Wallet, Upload } from "lucide-react";
import { importFinesExcel, importSalikExcel, type ImportSummary } from "@/lib/excelImport";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ListPagination, getPaginatedRows } from "@/components/ListPagination";

type ChargeStatus = "Unpaid" | "Charged to Client" | "Paid";

interface FineRow {
  id: string;
  fine_number: string | null;
  fine_date: string;
  fine_type: string;
  black_points: number;
  amount: number;
  source: string;
  status: string;
  notes: string | null;
  car_id: string | null;
  client_id: string | null;
  contract_id: string | null;
  cars: { plate: string } | null;
  clients: { full_name: string } | null;
}

interface SalikRow {
  id: string;
  transaction_id: string | null;
  charge_date: string;
  trips: number;
  amount: number;
  status: string;
  car_id: string | null;
  client_id: string | null;
  contract_id: string | null;
  cars: { plate: string } | null;
  clients: { full_name: string } | null;
}

interface CarOption { id: string; plate: string; make: string; model: string; }
interface ClientOption { id: string; full_name: string; }

const fineTypes = ["Speeding", "Parking", "Signal", "Phone Use", "Other"];
const fineSources = ["Dubai Police", "Abu Dhabi Police", "Sharjah Police", "RTA"];

const statusClasses: Record<string, string> = {
  Unpaid: "bg-tint-rose text-tint-rose-foreground",
  "Charged to Client": "bg-tint-amber text-tint-amber-foreground",
  "Paid by Client": "bg-tint-green text-tint-green-foreground",
  "Paid by Company": "bg-tint-blue text-tint-blue-foreground",
  Paid: "bg-tint-green text-tint-green-foreground",
};

const matchesSearch = (value: string | null | undefined, query: string) =>
  (value ?? "").toLowerCase().includes(query);

function formatDate(iso: string): string {
  const dateMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  const [, year, month, day] = dateMatch;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const dateLabel = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeMatch = iso.match(/[T\s](\d{2}):(\d{2})/);

  return timeMatch ? `${dateLabel} · ${timeMatch[1]}:${timeMatch[2]}` : dateLabel;
}

const Fines = () => {
  const [fines, setFines] = useState<FineRow[]>([]);
  const [salik, setSalik] = useState<SalikRow[]>([]);
  const [cars, setCars] = useState<CarOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fineOpen, setFineOpen] = useState(false);
  const [fineCarOpen, setFineCarOpen] = useState(false);
  const [salikOpen, setSalikOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ kind: "Fines" | "Salik"; summary: ImportSummary } | null>(null);
  const finesFileRef = useRef<HTMLInputElement>(null);
  const salikFileRef = useRef<HTMLInputElement>(null);
  const [finesPage, setFinesPage] = useState(1);
  const [finesPageSize, setFinesPageSize] = useState(25);
  const [salikPage, setSalikPage] = useState(1);
  const [salikPageSize, setSalikPageSize] = useState(25);
  const [chargingAllFines, setChargingAllFines] = useState(false);
  const [chargingAllSalik, setChargingAllSalik] = useState(false);
  const [activeTab, setActiveTab] = useState("fines");
  const [finesSearch, setFinesSearch] = useState("");
  const [salikSearch, setSalikSearch] = useState("");

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>, kind: "Fines" | "Salik") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const summary = kind === "Fines" ? await importFinesExcel(file) : await importSalikExcel(file);
      setImportSummary({ kind, summary });
      if (summary.imported > 0) toast.success(`${summary.imported} ${kind.toLowerCase()} imported`);
      else if (summary.errors.length) toast.error(summary.errors[0]);
      fetchData();
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const [fineForm, setFineForm] = useState({
    fine_number: "",
    fine_date: "",
    car_id: "",
    fine_type: "Speeding",
    amount: 0,
    black_points: "",
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

  useEffect(() => {
    setFinesPage(1);
  }, [finesPageSize, finesSearch]);

  useEffect(() => {
    setSalikPage(1);
  }, [salikPageSize, salikSearch]);

  const filteredFines = useMemo(() => {
    const query = finesSearch.trim().toLowerCase();
    if (!query) return fines;

    return fines.filter((fine) =>
      matchesSearch(fine.fine_number, query) ||
      matchesSearch(fine.clients?.full_name, query) ||
      matchesSearch(fine.cars?.plate, query),
    );
  }, [fines, finesSearch]);

  const filteredSalik = useMemo(() => {
    const query = salikSearch.trim().toLowerCase();
    if (!query) return salik;

    return salik.filter((charge) =>
      matchesSearch(charge.transaction_id, query) ||
      matchesSearch(charge.clients?.full_name, query) ||
      matchesSearch(charge.cars?.plate, query),
    );
  }, [salik, salikSearch]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredFines.length / finesPageSize));
    if (finesPage > totalPages) setFinesPage(totalPages);
  }, [filteredFines.length, finesPage, finesPageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredSalik.length / salikPageSize));
    if (salikPage > totalPages) setSalikPage(totalPages);
  }, [filteredSalik.length, salikPage, salikPageSize]);

  const paginatedFines = useMemo(
    () => getPaginatedRows(filteredFines, finesPage, finesPageSize),
    [filteredFines, finesPage, finesPageSize],
  );

  const paginatedSalik = useMemo(
    () => getPaginatedRows(filteredSalik, salikPage, salikPageSize),
    [filteredSalik, salikPage, salikPageSize],
  );

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setFinesSearch("");
    setSalikSearch("");
  };

  const totalUnpaidFines = useMemo(
    () => fines.filter((f) => f.status === "Unpaid").reduce((s, f) => s + Number(f.amount), 0),
    [fines],
  );

  const totalUnpaidSalik = useMemo(
    () => salik.filter((s) => s.status === "Unpaid").reduce((sum, s) => sum + Number(s.amount), 0),
    [salik],
  );

  const chargeableFines = useMemo(
    () => fines.filter((fine) => fine.status === "Unpaid" && fine.contract_id !== null),
    [fines],
  );

  const chargeableSalik = useMemo(
    () => salik.filter((charge) => charge.status === "Unpaid" && charge.contract_id !== null),
    [salik],
  );

  const chargeableFinesTotal = useMemo(
    () => chargeableFines.reduce((sum, fine) => sum + Number(fine.amount), 0),
    [chargeableFines],
  );

  const chargeableSalikTotal = useMemo(
    () => chargeableSalik.reduce((sum, charge) => sum + Number(charge.amount), 0),
    [chargeableSalik],
  );

  const salikBalance = useMemo(
    () => salik.reduce((sum, s) => sum + Number(s.amount), 0),
    [salik],
  );

  const refetchFines = async () => {
    const { data, error } = await supabase
      .from("fines")
      .select("*, cars(plate), clients(full_name)")
      .order("fine_date", { ascending: false });

    if (error) throw error;
    setFines((data as FineRow[]) || []);
  };

  const refetchSalik = async () => {
    const { data, error } = await supabase
      .from("salik")
      .select("*, cars(plate), clients(full_name)")
      .order("charge_date", { ascending: false });

    if (error) throw error;
    setSalik((data as SalikRow[]) || []);
  };

  const chargeAllUnpaidFines = async () => {
    const count = chargeableFines.length;
    if (count === 0) return;

    setChargingAllFines(true);
    try {
      const { error } = await supabase
        .from("fines")
        .update({ status: "Charged to Client" })
        .eq("status", "Unpaid")
        .not("contract_id", "is", null);

      if (error) throw error;
      await refetchFines();
      toast.success(`${count} fines charged to clients`);
    } catch (error) {
      toast.error(`Failed to charge fines: ${(error as Error).message}`);
    } finally {
      setChargingAllFines(false);
    }
  };

  const chargeAllUnpaidSalik = async () => {
    const count = chargeableSalik.length;
    if (count === 0) return;

    setChargingAllSalik(true);
    try {
      const { error } = await supabase
        .from("salik")
        .update({ status: "Charged to Client" })
        .eq("status", "Unpaid")
        .not("contract_id", "is", null);

      if (error) throw error;
      await refetchSalik();
      toast.success(`${count} Salik charges charged to clients`);
    } catch (error) {
      toast.error(`Failed to charge Salik: ${(error as Error).message}`);
    } finally {
      setChargingAllSalik(false);
    }
  };

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
    if (!fineForm.car_id || !fineForm.fine_date) return;

    const { data: activeContract, error: contractError } = await supabase
      .from("contracts")
      .select("id, client_id")
      .eq("car_id", fineForm.car_id)
      .lte("start_date", fineForm.fine_date)
      .gte("end_date", fineForm.fine_date)
      .in("status", ["Active", "active"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contractError) {
      toast.error("Failed to find active contract: " + contractError.message);
      return;
    }

    const finePayload = {
      fine_number: fineForm.fine_number.trim() || null,
      fine_date: fineForm.fine_date,
      car_id: fineForm.car_id,
      client_id: activeContract?.client_id ?? null,
      contract_id: activeContract?.id ?? null,
      fine_type: fineForm.fine_type,
      amount: Number(fineForm.amount),
      black_points: fineForm.black_points === "" ? null : Number(fineForm.black_points),
      source: fineForm.source,
      status: "Unpaid",
      notes: fineForm.notes.trim() || null,
    };

    const { error } = await supabase.from("fines").insert(finePayload);
    if (error) {
      toast.error("Failed to add fine: " + error.message);
    } else {
      toast.success("Fine added");
      setFineForm({
        fine_number: "",
        fine_date: "",
        car_id: "",
        fine_type: "Speeding",
        amount: 0,
        black_points: "",
        source: "Dubai Police",
        notes: "",
      });
      setFineCarOpen(false);
      setFineOpen(false);
      fetchData();
    }
  };

  const handleAddSalik = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salikForm.car_id || !salikForm.client_id || !salikForm.charge_date) return;

    const { data: activeContract, error: contractError } = await supabase
      .from("contracts")
      .select("id")
      .eq("car_id", salikForm.car_id)
      .lte("start_date", salikForm.charge_date)
      .gte("end_date", salikForm.charge_date)
      .in("status", ["Active", "active"])
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contractError) {
      toast.error("Failed to find active contract: " + contractError.message);
      return;
    }

    const { error } = await supabase.from("salik").insert({
      charge_date: salikForm.charge_date,
      car_id: salikForm.car_id,
      client_id: salikForm.client_id,
      contract_id: activeContract?.id ?? null,
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
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col gap-5">
        <TabsList className="w-fit">
          <TabsTrigger value="fines">Traffic Fines</TabsTrigger>
          <TabsTrigger value="salik">Salik Charges</TabsTrigger>
        </TabsList>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            value={activeTab === "fines" ? finesSearch : salikSearch}
            onChange={(e) => activeTab === "fines" ? setFinesSearch(e.target.value) : setSalikSearch(e.target.value)}
            placeholder={activeTab === "fines" ? "Search fine number, client, or plate..." : "Search transaction ID, client, or plate..."}
            className="w-full rounded-lg border border-white/10 bg-background pl-9 text-foreground placeholder:text-white/40"
          />
        </div>

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

          <div className="flex flex-wrap items-center justify-end gap-2">
            <input ref={finesFileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => handleImportFile(e, "Fines")} />
            <Button size="sm" variant="outline" className="gap-1.5" disabled={importing} onClick={() => finesFileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {importing ? "Importing..." : "Import Fines (Excel)"}
            </Button>
            {chargeableFines.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={chargingAllFines}>
                    Charge All Unpaid
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Charge all unpaid fines?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {chargeableFines.length} fines totalling AED {chargeableFinesTotal.toLocaleString()} will be charged to their clients.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={chargingAllFines}>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={chargingAllFines} onClick={chargeAllUnpaidFines}>
                      {chargingAllFines ? "Charging..." : "Charge All"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5 sm:col-span-2">
                      <Label htmlFor="f-number">Fine Number</Label>
                      <Input
                        id="f-number"
                        type="text"
                        value={fineForm.fine_number}
                        onChange={(e) => setFineForm({ ...fineForm, fine_number: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="f-date">Date</Label>
                      <Input id="f-date" type="date" required value={fineForm.fine_date} onChange={(e) => setFineForm({ ...fineForm, fine_date: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Car</Label>
                      <Popover open={fineCarOpen} onOpenChange={setFineCarOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={fineCarOpen}
                            className="w-full justify-between font-normal"
                          >
                            <span className={cn("truncate", !fineForm.car_id && "text-muted-foreground")}>
                              {fineForm.car_id
                                ? (() => {
                                    const car = cars.find((item) => item.id === fineForm.car_id);
                                    return car ? `${car.plate} — ${car.make} ${car.model}` : "Select car";
                                  })()
                                : "Select car"}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search plate or model..." />
                            <CommandList>
                              <CommandEmpty>No car found.</CommandEmpty>
                              <CommandGroup>
                                {cars.map((car) => (
                                  <CommandItem
                                    key={car.id}
                                    value={`${car.plate} ${car.make} ${car.model}`}
                                    onSelect={() => {
                                      setFineForm({ ...fineForm, car_id: car.id });
                                      setFineCarOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        fineForm.car_id === car.id ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    <span className="truncate">{car.plate} — {car.make} {car.model}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
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
                    <div className="grid gap-1.5">
                      <Label htmlFor="f-black-points">Black Points</Label>
                      <Input
                        id="f-black-points"
                        type="number"
                        min={0}
                        max={30}
                        step={1}
                        value={fineForm.black_points}
                        onChange={(e) => setFineForm({ ...fineForm, black_points: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Source</Label>
                      <Select value={fineForm.source} onValueChange={(v) => setFineForm({ ...fineForm, source: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {fineSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5 sm:col-span-2">
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
                  <TableHead className="text-xs">Fine №</TableHead>
                  <TableHead className="text-xs">Car</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Payment</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
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
                ) : filteredFines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">No results found</TableCell>
                  </TableRow>
                ) : (
                  paginatedFines.map((f) => {
                    const paidAt = (f as FineRow & { paid_at?: string | null }).paid_at;
                    const displayedStatus: ChargeStatus = paidAt
                      ? "Paid"
                      : f.status === "Charged to Client"
                        ? "Charged to Client"
                        : "Unpaid";

                    return (
                      <TableRow key={f.id}>
                      <TableCell className="px-5 text-sm text-muted-foreground">{formatDate(f.fine_date)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-sm">{f.fine_number || "—"}</span>
                          {f.black_points > 0 && (
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                              <span className="font-mono text-xs text-red-400">{f.black_points} BP</span>
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{f.cars?.plate ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{f.clients?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{f.fine_type}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {Number(f.amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[paidAt ? "Paid" : "Unpaid"])}>
                          {paidAt ? "Paid" : "Unpaid"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{f.source}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {displayedStatus !== "Unpaid" && (
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[displayedStatus])}>
                              {displayedStatus}
                            </span>
                          )}
                          {displayedStatus === "Unpaid" && (
                            f.contract_id === null ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex">
                                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled>
                                        Charge to Client
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>No contract linked – cannot charge client</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => chargeFineToClient(f.id)}>
                                Charge to Client
                              </Button>
                            )
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
              page={finesPage}
              pageSize={finesPageSize}
              total={filteredFines.length}
              onPageChange={setFinesPage}
              onPageSizeChange={setFinesPageSize}
            />
          </div>
        </TabsContent>

        <TabsContent value="salik" className="m-0 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tint-blue text-tint-blue-foreground">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Total Salik Charges</div>
              <div className="text-base font-semibold text-foreground">AED {salikBalance.toLocaleString()}</div>
            </div>
            {totalUnpaidSalik > 0 && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Unpaid charges</div>
                <div className="text-sm font-semibold text-tint-rose-foreground">AED {totalUnpaidSalik.toLocaleString()}</div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <input ref={salikFileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => handleImportFile(e, "Salik")} />
            <Button size="sm" variant="outline" className="gap-1.5" disabled={importing} onClick={() => salikFileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {importing ? "Importing..." : "Import Salik (Excel)"}
            </Button>
            {chargeableSalik.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={chargingAllSalik}>
                    Charge All Unpaid
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Charge all unpaid Salik?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {chargeableSalik.length} Salik charges totalling AED {chargeableSalikTotal.toLocaleString()} will be charged to their clients.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={chargingAllSalik}>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={chargingAllSalik} onClick={chargeAllUnpaidSalik}>
                      {chargingAllSalik ? "Charging..." : "Charge All"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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
                  <TableHead className="text-xs">Transaction ID</TableHead>
                  <TableHead className="text-xs">Car</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">Loading Salik charges...</TableCell>
                  </TableRow>
                ) : salik.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">No Salik charges recorded.</TableCell>
                  </TableRow>
                ) : filteredSalik.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">No results found</TableCell>
                  </TableRow>
                ) : (
                  paginatedSalik.map((s) => {
                    const paidAt = (s as SalikRow & { paid_at?: string | null }).paid_at;
                    const displayedStatus: ChargeStatus = paidAt
                      ? "Paid"
                      : s.status === "Charged to Client"
                        ? "Charged to Client"
                        : "Unpaid";

                    return (
                      <TableRow key={s.id}>
                      <TableCell className="px-5 text-sm text-muted-foreground">{formatDate(s.charge_date)}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{s.transaction_id || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{s.cars?.plate ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">{s.clients?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground">AED {Number(s.amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {displayedStatus === "Charged to Client" && (
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[displayedStatus])}>
                              {displayedStatus}
                            </span>
                          )}
                          {displayedStatus === "Unpaid" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => chargeSalikToClient(s.id)}>
                              Charge to Client
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
              page={salikPage}
              pageSize={salikPageSize}
              total={filteredSalik.length}
              onPageChange={setSalikPage}
              onPageSizeChange={setSalikPageSize}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!importSummary} onOpenChange={(o) => !o && setImportSummary(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{importSummary?.kind} import summary</DialogTitle>
            <DialogDescription>Results of the latest Excel import.</DialogDescription>
          </DialogHeader>
          {importSummary && (
            <div className="grid gap-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Total rows</div>
                  <div className="text-base font-semibold text-foreground">{importSummary.summary.totalRows}</div>
                </div>
                <div className="rounded-lg border border-border bg-tint-green px-3 py-2">
                  <div className="text-xs text-tint-green-foreground/80">Imported</div>
                  <div className="text-base font-semibold text-tint-green-foreground">{importSummary.summary.imported}</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Skipped (zero amount)</div>
                  <div className="text-base font-semibold text-foreground">{importSummary.summary.skippedZero}</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Skipped (duplicate)</div>
                  <div className="text-base font-semibold text-foreground">{importSummary.summary.skippedDuplicate}</div>
                </div>
              </div>
              {importSummary.summary.unmatchedPlates.length > 0 && (
                <div className="rounded-lg border border-tint-amber-foreground/30 bg-tint-amber px-3 py-2">
                  <div className="text-xs font-semibold text-tint-amber-foreground">No matching vehicle ({importSummary.summary.unmatchedPlates.length})</div>
                  <div className="mt-1 max-h-32 overflow-y-auto text-xs text-tint-amber-foreground/90">
                    {importSummary.summary.unmatchedPlates.join(", ")}
                  </div>
                </div>
              )}
              {importSummary.summary.errors.length > 0 && (
                <div className="rounded-lg border border-tint-rose-foreground/30 bg-tint-rose px-3 py-2 text-xs text-tint-rose-foreground">
                  {importSummary.summary.errors.join(" · ")}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportSummary(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Fines;
