import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Upload, Wrench } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MaintenancePanel } from "@/components/MaintenancePanel";
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
import { supabase } from "@/lib/supabase";
import { syncVehicleStatusesWithContracts } from "@/lib/vehicleStatusSync";
import { Badge } from "@/components/ui/badge";
import { previewLegacyFleetImport, type LegacyFleetImportPreview } from "@/lib/fleetImport";
import { toast } from "sonner";
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

type Status = "Available" | "Rented" | "Service";

interface Car {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  status: Status;
  insurance_expiry: string | null;
  mulkiya_expiry: string | null;
  tag_number: string | null;
}

function toSupabaseMessage(error: { code?: string; message?: string } | null): string {
  if (error?.code === "PGRST205") {
    return "Supabase tables are missing in this project. Run migrations, then retry.";
  }
  return error?.message || "unknown error";
}

const statusClasses: Record<Status, string> = {
  Available: "bg-tint-green text-tint-green-foreground",
  Rented: "bg-tint-blue text-tint-blue-foreground",
  Service: "bg-tint-amber text-tint-amber-foreground",
};

const filters: ("All" | Status)[] = ["All", "Available", "Rented", "Service"];

const emptyForm = {
  plate: "",
  make: "",
  model: "",
  year: new Date().getFullYear(),
  color: "",
  status: "Available" as Status,
  insurance_expiry: "",
  mulkiya_expiry: "",
  tag_number: "",
};

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function expiryCellClass(iso: string | null): string {
  if (!iso) return "text-muted-foreground";
  const d = daysUntil(iso);
  if (d < 0) return "bg-tint-rose/60 text-tint-rose-foreground font-medium";
  if (d <= 30) return "bg-tint-amber/60 text-tint-amber-foreground font-medium";
  return "text-muted-foreground";
}

function isCarIncomplete(car: Car): boolean {
  return !car.plate?.trim()
    || !car.make?.trim()
    || !car.model?.trim()
    || !car.year
    || !car.tag_number?.trim()
    || !car.insurance_expiry
    || !car.mulkiya_expiry;
}

const Fleet = () => {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All" | Status>("All");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [plateError, setPlateError] = useState("");
  const [tagError, setTagError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [selectedMaintenanceCarId, setSelectedMaintenanceCarId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<LegacyFleetImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchCars = async () => {
    try {
      await syncVehicleStatusesWithContracts();
    } catch (syncErr) {
      console.error("Vehicle status sync failed:", syncErr);
    }

    const { data, error } = await supabase
      .from("cars")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(`Failed to load fleet: ${toSupabaseMessage(error)}`);
    } else {
      setCars((data as Car[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCars();
  }, []);

  const filtered = useMemo(
    () => (filter === "All" ? cars : cars.filter((c) => c.status === filter)),
    [cars, filter],
  );

  useEffect(() => {
    setPage(1);
  }, [filter, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, page, pageSize]);

  const paginatedCars = useMemo(
    () => getPaginatedRows(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const counts = useMemo(
    () => ({
      All: cars.length,
      Available: cars.filter((c) => c.status === "Available").length,
      Rented: cars.filter((c) => c.status === "Rented").length,
      Service: cars.filter((c) => c.status === "Service").length,
    }),
    [cars],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPlateError("");
    setTagError("");
    setOpen(true);
  };

  const openEdit = (car: Car) => {
    setEditingId(car.id);
    setForm({
      plate: car.plate,
      make: car.make,
      model: car.model,
      year: car.year,
      color: car.color ?? "",
      status: car.status,
      insurance_expiry: car.insurance_expiry ?? "",
      mulkiya_expiry: car.mulkiya_expiry ?? "",
      tag_number: car.tag_number ?? "",
    });
    setPlateError("");
    setTagError("");
    setOpen(true);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImportLoading(true);
    setImportPreview(null);
    try {
      const preview = await previewLegacyFleetImport(file, cars.map((car) => ({ plate: car.plate })));
      setImportPreview(preview);
    } catch (error) {
      console.error("Fleet import preview error:", error);
      toast.error("Could not read this XLSX file");
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportReadyRows = async () => {
    if (!importPreview) return;
    const readyRows = importPreview.rows.filter((row) => row.ready && row.year !== null);
    if (!readyRows.length) {
      toast.error("No rows are ready to import");
      return;
    }

    setImporting(true);
    const payload = readyRows.map((row) => ({
      plate: row.plate,
      make: row.make,
      model: row.model,
      year: row.year,
      status: row.status,
      tag_number: row.tag_number,
      insurance_expiry: row.insurance_expiry,
      mulkiya_expiry: row.mulkiya_expiry,
    }));

    const { error } = await supabase.from("cars").insert(payload as never);
    setImporting(false);
    if (error) {
      toast.error(`Failed to import fleet: ${toSupabaseMessage(error)}`);
      return;
    }

    toast.success(`Imported ${readyRows.length} cars`);
    setImportOpen(false);
    setImportPreview(null);
    fetchCars();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting vehicle form...", { form, editingId });
    setPlateError("");
    setTagError("");

    if (!editingId) {
      const plateToCheck = form.plate.trim();
      if (plateToCheck) {
        const { data: existingPlate, error: plateDupErr } = await supabase
          .from("cars")
          .select("id")
          .eq("plate", plateToCheck)
          .limit(1);
        if (plateDupErr) {
          toast.error("Could not validate plate number");
          return;
        }
        if (existingPlate && existingPlate.length > 0) {
          setPlateError("This plate number already exists");
          return;
        }
      }

      const tagToCheck = form.tag_number.trim();
      if (tagToCheck) {
        const { data: existingTag, error: tagDupErr } = await supabase
          .from("cars")
          .select("id")
          .eq("tag_number", tagToCheck)
          .limit(1);
        if (tagDupErr) {
          toast.error("Could not validate tag number");
          return;
        }
        if (existingTag && existingTag.length > 0) {
          setTagError("This tag number already exists");
          return;
        }
      }
    }

    setSaving(true);
    const payload = {
      plate: form.plate.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      year: Number(form.year),
      color: form.color.trim() || null,
      status: form.status,
      insurance_expiry: form.insurance_expiry || null,
      mulkiya_expiry: form.mulkiya_expiry || null,
      tag_number: form.tag_number.trim() || null,
    };

    try {
      const { error } = editingId
        ? await supabase.from("cars").update(payload).eq("id", editingId)
        : await supabase.from("cars").insert(payload);
      
      setSaving(false);
      if (error) {
        toast.error(`Failed to ${editingId ? "update" : "add"} car: ${toSupabaseMessage(error)}`);
        console.error("Vehicle submission error:", error);
      } else {
        toast.success(editingId ? "Car updated" : "Car added to fleet");
        setOpen(false);
        setEditingId(null);
        setForm(emptyForm);
        fetchCars();
      }
    } catch (err) {
      setSaving(false);
      toast.error("An unexpected error occurred while saving vehicle");
      console.error(err);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!editingId) return;
    setDeleting(true);
    const { count, error: activeErr } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("car_id", editingId)
      .in("status", ["Active", "Expiring Soon"]);
    if (activeErr) {
      setDeleting(false);
      toast.error("Failed to verify active contracts");
      return;
    }
    if ((count ?? 0) > 0) {
      setDeleting(false);
      setConfirmDeleteOpen(false);
      toast.error("Cannot delete vehicle with active contracts");
      return;
    }

    const { error: deleteErr } = await supabase.from("cars").delete().eq("id", editingId);
    setDeleting(false);
    setConfirmDeleteOpen(false);
    if (deleteErr) {
      toast.error(`Failed to delete vehicle: ${deleteErr.message}`);
      return;
    }

    toast.success("Vehicle deleted");
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    fetchCars();
  };

  return (
    <DashboardLayout title="Fleet" subtitle="Manage your vehicles">
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
                <span className="ml-1.5 opacity-60">{counts[f]}</span>
              </button>
            ))}
          </div>

          <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setImportPreview(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Import XLSX
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px] text-foreground font-dm-sans">
              <DialogHeader>
                <DialogTitle className="text-foreground">Import legacy fleet</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Preview old XLSX vehicles before inserting them. Existing plate numbers are skipped.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center hover:border-foreground/30">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {importLoading ? "Reading XLSX..." : "Choose XLSX file"}
                  </span>
                  <span className="text-xs text-muted-foreground">No rows are imported until you confirm.</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    disabled={importLoading || importing}
                    onChange={(event) => handleImportFile(event.target.files?.[0])}
                  />
                </label>

                {importPreview && (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[
                        ["Total rows", importPreview.totalRows],
                        ["Ready rows", importPreview.rowsReady],
                        ["Duplicate plates", importPreview.duplicatePlates],
                        ["Missing required", importPreview.missingRequiredData],
                        ["Skipped rows", importPreview.skippedRows],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
                          <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>

                    {importPreview.missingRequiredData > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                        {importPreview.missingRequiredData} rows are missing plate, make, model, or year and will be skipped.
                      </div>
                    )}

                    <div className="max-h-64 overflow-auto rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs">Row</TableHead>
                            <TableHead className="text-xs">Plate</TableHead>
                            <TableHead className="text-xs">Make & Model</TableHead>
                            <TableHead className="text-xs">Year</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importPreview.rows.slice(0, 50).map((row) => (
                            <TableRow key={row.rowNumber}>
                              <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                              <TableCell className="font-mono text-xs">{row.plate || "—"}</TableCell>
                              <TableCell className="text-sm">{row.make || "—"} {row.model || ""}</TableCell>
                              <TableCell className="font-mono text-xs">{row.year ?? "—"}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={row.ready ? "secondary" : "outline"}
                                  className={cn(
                                    "text-[11px]",
                                    row.ready
                                      ? "bg-tint-green text-tint-green-foreground"
                                      : "border-amber-500/40 text-amber-700",
                                  )}
                                >
                                  {row.ready ? "Ready" : row.skipReason}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleImportReadyRows}
                  disabled={!importPreview || importPreview.rowsReady === 0 || importing}
                >
                  {importing ? "Importing..." : `Import ${importPreview?.rowsReady ?? 0} ready rows`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setPlateError(""); setTagError(""); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                Add Car
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit vehicle" : "Add a new car"}</DialogTitle>
                <DialogDescription>
                  {editingId ? "Update the vehicle details below." : "Enter the vehicle details below."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="plate">Plate Number</Label>
                    <Input
                      id="plate"
                      required
                      value={form.plate}
                      onChange={(e) => {
                        setForm({ ...form, plate: e.target.value });
                        setPlateError("");
                      }}
                      placeholder="DXB A 12345"
                    />
                    {plateError && <p className="text-xs text-destructive">{plateError}</p>}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      required
                      min={1990}
                      max={2100}
                      value={form.year}
                      onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="color">Color</Label>
                    <Input
                      id="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      placeholder="White"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="make">Make</Label>
                    <Input
                      id="make"
                      required
                      value={form.make}
                      onChange={(e) => setForm({ ...form, make: e.target.value })}
                      placeholder="Toyota"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="model">Model</Label>
                    <Input
                      id="model"
                      required
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      placeholder="Corolla"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="insurance">Insurance Expiry</Label>
                    <Input
                      id="insurance"
                      type="date"
                      value={form.insurance_expiry}
                      onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="mulkiya">Mulkiya Expiry</Label>
                    <Input
                      id="mulkiya"
                      type="date"
                      value={form.mulkiya_expiry}
                      onChange={(e) => setForm({ ...form, mulkiya_expiry: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tag_number">Salik Tag Number</Label>
                  <Input
                    id="tag_number"
                    value={form.tag_number}
                    onChange={(e) => {
                      setForm({ ...form, tag_number: e.target.value });
                      setTagError("");
                    }}
                    placeholder="10404966"
                  />
                  {tagError && <p className="text-xs text-destructive">{tagError}</p>}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as Status })}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Available">Available</SelectItem>
                      <SelectItem value="Rented">Rented</SelectItem>
                      <SelectItem value="Service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Save Changes" : "Add Car"}
                  </Button>
                </DialogFooter>
                {editingId && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={deleting}
                  >
                    Delete Vehicle
                  </Button>
                )}
              </form>
            </DialogContent>
          </Dialog>
          <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The vehicle can be deleted only if there are no active contracts.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteVehicle}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete Vehicle"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Plate</TableHead>
                <TableHead className="text-xs">Make & Model</TableHead>
                <TableHead className="text-xs">Year</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Info</TableHead>
                <TableHead className="text-xs">Insurance Expiry</TableHead>
                <TableHead className="text-xs">Mulkiya Expiry</TableHead>
                <TableHead className="px-5 text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    Loading fleet...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    No cars match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCars.map((car) => (
                  <TableRow key={car.id}>
                    <TableCell className="px-5 font-mono text-xs text-foreground">{car.plate}</TableCell>
                    <TableCell className="font-medium text-foreground">{car.make} {car.model}</TableCell>
                    <TableCell className="text-muted-foreground">{car.year}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          statusClasses[car.status as Status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {car.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isCarIncomplete(car) ? "outline" : "secondary"}
                        className={cn(
                          "text-[11px]",
                          isCarIncomplete(car)
                            ? "border-amber-500/40 text-amber-700"
                            : "bg-tint-green text-tint-green-foreground",
                        )}
                      >
                        {isCarIncomplete(car) ? "Missing info" : "Complete"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs", expiryCellClass(car.insurance_expiry))}>
                        {formatDate(car.insurance_expiry)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs", expiryCellClass(car.mulkiya_expiry))}>
                        {formatDate(car.mulkiya_expiry)}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          onClick={() => setSelectedMaintenanceCarId(car.id)}
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          Service
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          onClick={() => openEdit(car)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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
      <MaintenancePanel
        carId={selectedMaintenanceCarId ?? ""}
        open={!!selectedMaintenanceCarId}
        onClose={() => setSelectedMaintenanceCarId(null)}
      />
    </DashboardLayout>
  );
};

export default Fleet;
