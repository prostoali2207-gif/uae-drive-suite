import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { supabase } from "@/lib/supabase";
import { syncVehicleStatusesWithContracts } from "@/lib/vehicleStatusSync";
import { toast } from "sonner";
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
      status: car.status,
      insurance_expiry: car.insurance_expiry ?? "",
      mulkiya_expiry: car.mulkiya_expiry ?? "",
      tag_number: car.tag_number ?? "",
    });
    setPlateError("");
    setTagError("");
    setOpen(true);
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
                <TableHead className="text-xs">Insurance Expiry</TableHead>
                <TableHead className="text-xs">Mulkiya Expiry</TableHead>
                <TableHead className="px-5 text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    Loading fleet...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    No cars match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((car) => (
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
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        onClick={() => openEdit(car)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Fleet;
