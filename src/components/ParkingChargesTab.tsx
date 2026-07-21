import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import { importParkingPdf, type ParkingImportSummary } from "@/lib/parkingPdfImport";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListPagination, getPaginatedRows } from "@/components/ListPagination";
import { cn } from "@/lib/utils";

interface ParkingRow {
  id: string;
  parking_date: string;
  location: string;
  parking_zone: string | null;
  amount: number;
  status: string;
  contract_id: string | null;
  paid_at: string | null;
  cars: { plate: string } | null;
  clients: { full_name: string } | null;
}

const statusClasses: Record<string, string> = {
  "Charged to Client": "bg-tint-amber text-tint-amber-foreground",
  Paid: "bg-tint-green text-tint-green-foreground",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", " ·");
}

function money(value: number): string {
  return `AED ${Number(value).toLocaleString()}`;
}

export function ParkingChargesTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParkingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [charging, setCharging] = useState(false);
  const [summary, setSummary] = useState<ParkingImportSummary | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadRows = async () => {
    setLoading(true);
    const all: ParkingRow[] = [];
    const batchSize = 1000;
    for (let from = 0; ; from += batchSize) {
      const { data, error } = await (supabase as any)
        .from("parking_charges")
        .select("id, parking_date, location, parking_zone, amount, status, contract_id, paid_at, cars(plate), clients(full_name)")
        .order("parking_date", { ascending: false })
        .range(from, from + batchSize - 1);
      if (error) {
        toast.error(`Failed to load parking: ${error.message}`);
        break;
      }
      const batch = (data ?? []) as ParkingRow[];
      all.push(...batch);
      if (batch.length < batchSize) break;
    }
    setRows(all);
    setLoading(false);
  };

  useEffect(() => { void loadRows(); }, []);
  useEffect(() => { setPage(1); }, [search, pageSize]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      row.location.toLowerCase().includes(query) ||
      (row.parking_zone ?? "").toLowerCase().includes(query) ||
      (row.cars?.plate ?? "").toLowerCase().includes(query) ||
      (row.clients?.full_name ?? "").toLowerCase().includes(query),
    );
  }, [rows, search]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.amount), 0), [rows]);
  const chargeable = useMemo(
    () => rows.filter((row) => row.status === "Unpaid" && row.contract_id !== null),
    [rows],
  );
  const chargeableTotal = useMemo(
    () => chargeable.reduce((sum, row) => sum + Number(row.amount), 0),
    [chargeable],
  );

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const result = await importParkingPdf(file);
      setSummary(result);
      if (result.imported > 0) toast.success(`${result.imported} parking charges imported`);
      else if (result.errors.length > 0) toast.error(result.errors[0]);
      await loadRows();
    } catch (error) {
      toast.error(`Parking import failed: ${(error as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const chargeOne = async (id: string) => {
    const { error } = await (supabase as any)
      .from("parking_charges")
      .update({ status: "Charged to Client" })
      .eq("id", id);
    if (error) toast.error(`Failed to update parking: ${error.message}`);
    else {
      toast.success("Parking charged to client");
      await loadRows();
    }
  };

  const chargeAll = async () => {
    setCharging(true);
    const { error } = await (supabase as any)
      .from("parking_charges")
      .update({ status: "Charged to Client" })
      .eq("status", "Unpaid")
      .not("contract_id", "is", null);
    if (error) toast.error(`Failed to charge parking: ${error.message}`);
    else {
      toast.success(`${chargeable.length} parking charges charged to clients`);
      await loadRows();
    }
    setCharging(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search parking, client, or plate..."
          className="w-full rounded-lg border border-white/10 bg-background pl-9 text-foreground placeholder:text-white/40"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tint-blue text-tint-blue-foreground">
          <Wallet className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">Total Parking Charges</div>
          <div className="text-base font-semibold text-foreground">{money(total)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Transactions</div>
          <div className="text-sm font-semibold text-foreground">{rows.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleImport} />
        <Button size="sm" variant="outline" className="gap-1.5" disabled={importing} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" />
          {importing ? "Importing..." : "Import Parking (PDF)"}
        </Button>
        {chargeable.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={charging}>Charge All Unpaid</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Charge all unpaid parking?</AlertDialogTitle>
                <AlertDialogDescription>
                  {chargeable.length} parking charges totalling {money(chargeableTotal)} will be charged to linked clients.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={charging}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={charging} onClick={chargeAll}>
                  {charging ? "Charging..." : "Charge All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-5 text-xs">Date</TableHead>
              <TableHead className="text-xs">Car</TableHead>
              <TableHead className="text-xs">Client</TableHead>
              <TableHead className="text-xs">Parking</TableHead>
              <TableHead className="text-xs">Zone</TableHead>
              <TableHead className="text-xs">Amount</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">Loading parking...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">No parking charges recorded. Import a Salik Statement PDF.</TableCell></TableRow>
            ) : getPaginatedRows(filtered, page, pageSize).map((row) => {
              const displayedStatus = row.paid_at ? "Paid" : row.status;
              return (
                <TableRow key={row.id}>
                  <TableCell className="px-5 text-sm text-muted-foreground">{formatDate(row.parking_date)}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground">{row.cars?.plate ?? "—"}</TableCell>
                  <TableCell className="text-sm font-medium text-foreground">{row.clients?.full_name ?? "Not linked"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.location}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.parking_zone ?? "—"}</TableCell>
                  <TableCell className="text-sm font-medium text-foreground">{money(row.amount)}</TableCell>
                  <TableCell>
                    {displayedStatus === "Unpaid" && row.contract_id ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void chargeOne(row.id)}>Charge to Client</Button>
                    ) : displayedStatus === "Unpaid" ? (
                      <span className="text-xs text-muted-foreground">Not linked</span>
                    ) : (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusClasses[displayedStatus] ?? "bg-muted text-muted-foreground")}>{displayedStatus}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <ListPagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>

      <Dialog open={summary !== null} onOpenChange={(open) => !open && setSummary(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Parking import summary</DialogTitle>
            <DialogDescription>Only parking rows are imported. Toll rows are ignored.</DialogDescription>
          </DialogHeader>
          {summary && (
            <div className="grid gap-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>PDF parking: {summary.expectedCount ?? "—"}</div>
                <div>Read: {summary.totalRows}</div>
                <div>Imported: {summary.imported}</div>
                <div>Duplicates: {summary.skippedDuplicate}</div>
                <div>Amount: {money(summary.foundAmount)}</div>
                <div>No contract: {summary.unmatchedContracts}</div>
              </div>
              {summary.unmatchedPlates.length > 0 && <div className="text-tint-amber-foreground">Unknown plates: {summary.unmatchedPlates.join(", ")}</div>}
              {summary.errors.length > 0 && <div className="text-tint-rose-foreground">{summary.errors.join(" · ")}</div>}
            </div>
          )}
          <DialogFooter><Button onClick={() => setSummary(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
