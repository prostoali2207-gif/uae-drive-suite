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

type Status = "Available" | "Rented" | "Service";

interface Car {
  id: string;
  plate: string;
  makeModel: string;
  year: number;
  status: Status;
  insuranceExpiry: string; // ISO date
  mulkiyaExpiry: string; // ISO date
  renter: string;
}

const initialCars: Car[] = [
  { id: "1", plate: "DXB A 12345", makeModel: "Toyota Corolla", year: 2023, status: "Rented", insuranceExpiry: "2026-05-10", mulkiyaExpiry: "2026-11-02", renter: "Ahmed Al Mansoori" },
  { id: "2", plate: "DXB F 87231", makeModel: "Nissan Sunny", year: 2022, status: "Rented", insuranceExpiry: "2026-04-28", mulkiyaExpiry: "2027-01-15", renter: "Sara Hassan" },
  { id: "3", plate: "AUH B 44120", makeModel: "Hyundai Elantra", year: 2024, status: "Available", insuranceExpiry: "2026-09-12", mulkiyaExpiry: "2026-04-18", renter: "" },
  { id: "4", plate: "DXB N 55891", makeModel: "Kia Pegas", year: 2023, status: "Rented", insuranceExpiry: "2027-02-20", mulkiyaExpiry: "2026-12-01", renter: "Layla Ibrahim" },
  { id: "5", plate: "SHJ 1 22019", makeModel: "Mitsubishi Attrage", year: 2022, status: "Service", insuranceExpiry: "2026-03-30", mulkiyaExpiry: "2026-08-22", renter: "" },
  { id: "6", plate: "DXB K 09812", makeModel: "Toyota Yaris", year: 2024, status: "Available", insuranceExpiry: "2027-06-04", mulkiyaExpiry: "2027-03-19", renter: "" },
  { id: "7", plate: "DXB Q 71234", makeModel: "Chevrolet Spark", year: 2021, status: "Rented", insuranceExpiry: "2026-04-22", mulkiyaExpiry: "2026-05-05", renter: "Omar Saeed" },
  { id: "8", plate: "AUH C 30021", makeModel: "Nissan Kicks", year: 2023, status: "Available", insuranceExpiry: "2026-10-11", mulkiyaExpiry: "2027-02-28", renter: "" },
];

const statusClasses: Record<Status, string> = {
  Available: "bg-tint-green text-tint-green-foreground",
  Rented: "bg-tint-blue text-tint-blue-foreground",
  Service: "bg-tint-amber text-tint-amber-foreground",
};

const filters: ("All" | Status)[] = ["All", "Available", "Rented", "Service"];

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function expiryCellClass(iso: string): string {
  const d = daysUntil(iso);
  if (d < 0) return "bg-tint-rose/60 text-tint-rose-foreground font-medium";
  if (d <= 30) return "bg-tint-amber/60 text-tint-amber-foreground font-medium";
  return "text-muted-foreground";
}

const Fleet = () => {
  const [cars, setCars] = useState<Car[]>(initialCars);
  const [filter, setFilter] = useState<"All" | Status>("All");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    plate: "",
    makeModel: "",
    year: new Date().getFullYear(),
    status: "Available" as Status,
    insuranceExpiry: "",
    mulkiyaExpiry: "",
    renter: "",
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCars((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        plate: form.plate,
        makeModel: form.makeModel,
        year: Number(form.year),
        status: form.status,
        insuranceExpiry: form.insuranceExpiry,
        mulkiyaExpiry: form.mulkiyaExpiry,
        renter: form.status === "Rented" ? form.renter : "",
      },
    ]);
    setOpen(false);
    setForm({
      plate: "",
      makeModel: "",
      year: new Date().getFullYear(),
      status: "Available",
      insuranceExpiry: "",
      mulkiyaExpiry: "",
      renter: "",
    });
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

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Car
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add a new car</DialogTitle>
                <DialogDescription>Enter the vehicle details below.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="plate">Plate Number</Label>
                    <Input
                      id="plate"
                      required
                      value={form.plate}
                      onChange={(e) => setForm({ ...form, plate: e.target.value })}
                      placeholder="DXB A 12345"
                    />
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
                <div className="grid gap-1.5">
                  <Label htmlFor="makeModel">Make & Model</Label>
                  <Input
                    id="makeModel"
                    required
                    value={form.makeModel}
                    onChange={(e) => setForm({ ...form, makeModel: e.target.value })}
                    placeholder="Toyota Corolla"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="insurance">Insurance Expiry</Label>
                    <Input
                      id="insurance"
                      type="date"
                      required
                      value={form.insuranceExpiry}
                      onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="mulkiya">Mulkiya Expiry</Label>
                    <Input
                      id="mulkiya"
                      type="date"
                      required
                      value={form.mulkiyaExpiry}
                      onChange={(e) => setForm({ ...form, mulkiyaExpiry: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                  <div className="grid gap-1.5">
                    <Label htmlFor="renter">Current Renter</Label>
                    <Input
                      id="renter"
                      value={form.renter}
                      onChange={(e) => setForm({ ...form, renter: e.target.value })}
                      placeholder="Optional"
                      disabled={form.status !== "Rented"}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Add Car</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
                <TableHead className="px-5 text-xs">Current Renter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    No cars match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((car) => (
                  <TableRow key={car.id}>
                    <TableCell className="px-5 font-mono text-xs text-foreground">{car.plate}</TableCell>
                    <TableCell className="font-medium text-foreground">{car.makeModel}</TableCell>
                    <TableCell className="text-muted-foreground">{car.year}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          statusClasses[car.status],
                        )}
                      >
                        {car.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs", expiryCellClass(car.insuranceExpiry))}>
                        {formatDate(car.insuranceExpiry)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs", expiryCellClass(car.mulkiyaExpiry))}>
                        {formatDate(car.mulkiyaExpiry)}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 text-sm text-muted-foreground">
                      {car.renter || <span className="text-muted-foreground/60">—</span>}
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
