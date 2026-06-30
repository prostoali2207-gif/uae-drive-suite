import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Save, Wrench } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type CarStatus = "Available" | "Rented" | "Service";

type Car = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  status: CarStatus;
  insurance_expiry: string | null;
  mulkiya_expiry: string | null;
  tag_number: string | null;
  owner_id: string;
};

type Maintenance = {
  id?: string;
  car_id: string;
  owner_id: string;
  last_service_date: string | null;
  next_service_date: string | null;
  current_mileage: number | null;
  oil_change_date: string | null;
  oil_change_mileage: number | null;
  notes: string | null;
};

type MaintenanceForm = {
  last_service_date: string;
  next_service_date: string;
  current_mileage: string;
  oil_change_date: string;
  oil_change_mileage: string;
  notes: string;
};

type CarForm = {
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string;
  status: CarStatus;
  insurance_expiry: string;
  mulkiya_expiry: string;
  tag_number: string;
};

type RentalHistoryRow = {
  id: string;
  contract_id: string;
  start_date: string | null;
  end_date: string | null;
  client_name: string;
  status: string;
  rate_amount: number | null;
  source: "contract" | "swap";
};

const emptyMaintenanceForm: MaintenanceForm = {
  last_service_date: "",
  next_service_date: "",
  current_mileage: "",
  oil_change_date: "",
  oil_change_mileage: "",
  notes: "",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const datePart = value.includes("T") ? value.slice(0, 10) : value;
  const parsed = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMileage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString()} km`;
}

function formatAed(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `AED ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function getClientName(client: any): string {
  if (!client) return "Unknown client";

  return client.full_name?.trim() || "Unknown client";
}

function getStatusBadgeClass(status: string): string {
  if (status === "Available" || status === "Active") {
    return "bg-tint-green text-tint-green-foreground";
  }
  if (status === "Rented") {
    return "bg-tint-amber text-tint-amber-foreground";
  }
  if (status === "Closed" || status === "Completed") {
    return "bg-muted text-muted-foreground";
  }
  return "bg-card text-muted-foreground";
}

function toCarForm(car: Car): CarForm {
  return {
    plate: car.plate,
    make: car.make,
    model: car.model,
    year: car.year,
    color: car.color ?? "",
    status: car.status,
    insurance_expiry: car.insurance_expiry ?? "",
    mulkiya_expiry: car.mulkiya_expiry ?? "",
    tag_number: car.tag_number ?? "",
  };
}

function toMaintenanceForm(record: Maintenance | null): MaintenanceForm {
  if (!record) return emptyMaintenanceForm;

  return {
    last_service_date: record.last_service_date ?? "",
    next_service_date: record.next_service_date ?? "",
    current_mileage: record.current_mileage?.toString() ?? "",
    oil_change_date: record.oil_change_date ?? "",
    oil_change_mileage: record.oil_change_mileage?.toString() ?? "",
    notes: record.notes ?? "",
  };
}

const FleetDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const db = supabase as any;

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [car, setCar] = useState<Car | null>(null);
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [history, setHistory] = useState<RentalHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCar, setSavingCar] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [editCarOpen, setEditCarOpen] = useState(false);
  const [editMaintenanceOpen, setEditMaintenanceOpen] = useState(false);
  const [carForm, setCarForm] = useState<CarForm | null>(null);
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceForm>(emptyMaintenanceForm);

  const fetchFleetDetail = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    const user = userResult?.user;

    if (userError || !user) {
      toast.error("You must be signed in to view vehicle details");
      setLoading(false);
      return;
    }

    setOwnerId(user.id);

    const [carResult, maintenanceResult, contractsResult, swapsResult] = await Promise.all([
      db
        .from("cars")
        .select("id, plate, make, model, year, color, status, insurance_expiry, mulkiya_expiry, tag_number, owner_id")
        .eq("id", id)
        .eq("owner_id", user.id)
        .maybeSingle(),
      db
        .from("car_maintenance")
        .select("id, car_id, owner_id, last_service_date, next_service_date, current_mileage, oil_change_date, oil_change_mileage, notes")
        .eq("car_id", id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("contracts")
        .select("id, client_id, start_date, end_date, status, rate_amount, owner_id, clients(full_name)")
        .eq("car_id", id)
        .eq("owner_id", user.id),
      db
        .from("contract_vehicles")
        .select("car_id, contract_id, started_at, ended_at, daily_rate, owner_id, contracts(id, client_id, start_date, end_date, status, rate_amount, owner_id, clients(full_name))")
        .eq("car_id", id)
        .eq("owner_id", user.id),
    ]);

    if (carResult.error) {
      toast.error(`Failed to load vehicle: ${carResult.error.message}`);
      setCar(null);
    } else {
      setCar((carResult.data as Car | null) ?? null);
      setCarForm(carResult.data ? toCarForm(carResult.data as Car) : null);
    }

    if (maintenanceResult.error) {
      toast.error(`Failed to load maintenance: ${maintenanceResult.error.message}`);
      setMaintenance(null);
    } else {
      setMaintenance((maintenanceResult.data as Maintenance | null) ?? null);
      setMaintenanceForm(toMaintenanceForm((maintenanceResult.data as Maintenance | null) ?? null));
    }

    if (contractsResult.error) {
      toast.error(`Failed to load rental history: ${contractsResult.error.message}`);
    }

    if (swapsResult.error) {
      toast.error(`Failed to load swap history: ${swapsResult.error.message}`);
    }

    const contractRows: RentalHistoryRow[] = ((contractsResult.data ?? []) as any[]).map((contract) => ({
      id: `contract-${contract.id}`,
      contract_id: contract.id,
      start_date: contract.start_date,
      end_date: contract.end_date,
      client_name: getClientName(contract.clients),
      status: contract.status,
      rate_amount: contract.rate_amount === null ? null : Number(contract.rate_amount),
      source: "contract",
    }));

    const swapRows: RentalHistoryRow[] = ((swapsResult.data ?? []) as any[]).map((swap) => ({
      id: `swap-${swap.contract_id}-${swap.started_at}`,
      contract_id: swap.contract_id,
      start_date: swap.started_at,
      end_date: swap.ended_at,
      client_name: getClientName(swap.contracts?.clients),
      status: swap.contracts?.status ?? "Unknown",
      rate_amount: swap.daily_rate === null || swap.daily_rate === undefined ? null : Number(swap.daily_rate),
      source: "swap",
    }));

    setHistory(
      [...contractRows, ...swapRows].sort((a, b) =>
        String(b.start_date ?? "").localeCompare(String(a.start_date ?? "")),
      ),
    );
    setLoading(false);
  }, [db, id]);

  useEffect(() => {
    fetchFleetDetail();
  }, [fetchFleetDetail]);

  const infoItems = useMemo(
    () => [
      ["Color", car?.color || "—"],
      ["Tag Number", car?.tag_number || "—"],
      ["Mulkiya Expiry", formatDate(car?.mulkiya_expiry)],
      ["Insurance Expiry", formatDate(car?.insurance_expiry)],
    ],
    [car],
  );

  const maintenanceItems = useMemo(
    () => [
      ["Last Service Date", formatDate(maintenance?.last_service_date)],
      ["Next Service Date", formatDate(maintenance?.next_service_date)],
      ["Current Mileage", formatMileage(maintenance?.current_mileage)],
      ["Oil Change Date", formatDate(maintenance?.oil_change_date)],
      ["Oil Change Mileage", formatMileage(maintenance?.oil_change_mileage)],
      ["Notes", maintenance?.notes || "—"],
    ],
    [maintenance],
  );

  const handleCarSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !ownerId || !carForm) return;

    setSavingCar(true);
    const payload = {
      plate: carForm.plate.trim(),
      make: carForm.make.trim(),
      model: carForm.model.trim(),
      year: Number(carForm.year),
      color: carForm.color.trim() || null,
      status: carForm.status,
      insurance_expiry: carForm.insurance_expiry || null,
      mulkiya_expiry: carForm.mulkiya_expiry || null,
      tag_number: carForm.tag_number.trim() || null,
    };

    const { error } = await db
      .from("cars")
      .update(payload)
      .eq("id", id)
      .eq("owner_id", ownerId);

    setSavingCar(false);
    if (error) {
      toast.error(`Failed to update vehicle: ${error.message}`);
      return;
    }

    toast.success("Vehicle updated");
    setEditCarOpen(false);
    await fetchFleetDetail();
  };

  const handleMaintenanceSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !ownerId) return;

    setSavingMaintenance(true);
    const payload = {
      car_id: id,
      owner_id: ownerId,
      last_service_date: maintenanceForm.last_service_date || null,
      next_service_date: maintenanceForm.next_service_date || null,
      current_mileage: maintenanceForm.current_mileage ? Number(maintenanceForm.current_mileage) : null,
      oil_change_date: maintenanceForm.oil_change_date || null,
      oil_change_mileage: maintenanceForm.oil_change_mileage ? Number(maintenanceForm.oil_change_mileage) : null,
      notes: maintenanceForm.notes.trim() || null,
    };

    const { error } = await db.from("car_maintenance").upsert(payload, {
      onConflict: "car_id",
    });

    setSavingMaintenance(false);
    if (error) {
      toast.error(`Failed to save maintenance: ${error.message}`);
      return;
    }

    toast.success("Maintenance saved");
    setEditMaintenanceOpen(false);
    await fetchFleetDetail();
  };

  return (
    <DashboardLayout title="Vehicle Detail" subtitle="Fleet vehicle profile">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => navigate("/fleet")}
              aria-label="Back to fleet"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-8 w-40 rounded bg-muted" />
                  <div className="h-4 w-56 rounded bg-muted" />
                </div>
              ) : car ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-ibm-plex-mono text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                      {car.plate}
                    </h2>
                    <Badge className={cn("text-xs", getStatusBadgeClass(car.status))}>
                      {car.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                    {car.make} {car.model} {car.year}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-semibold text-foreground">Vehicle not found</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This vehicle was not found for your account.
                  </p>
                </>
              )}
            </div>
          </div>

          <Button
            type="button"
            className="min-h-10 gap-2 self-start"
            disabled={!car}
            onClick={() => {
              if (car) setCarForm(toCarForm(car));
              setEditCarOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>

        {car && (
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger value="info" className="min-h-10 text-xs sm:text-sm">
                Info
              </TabsTrigger>
              <TabsTrigger value="maintenance" className="min-h-10 text-xs sm:text-sm">
                Maintenance
              </TabsTrigger>
              <TabsTrigger value="history" className="min-h-10 text-xs sm:text-sm">
                Rental History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="mt-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {infoItems.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-4">
                    <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
                    <div className="mt-2 font-ibm-plex-mono text-sm font-semibold text-foreground">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="maintenance" className="mt-5">
              <div className="mb-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10 gap-2"
                  onClick={() => {
                    setMaintenanceForm(toMaintenanceForm(maintenance));
                    setEditMaintenanceOpen(true);
                  }}
                >
                  <Wrench className="h-4 w-4" />
                  Edit
                </Button>
              </div>

              {!maintenance ? (
                <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  No maintenance records yet
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {maintenanceItems.map(([label, value]) => (
                    <div
                      key={label}
                      className={cn(
                        "rounded-lg border border-border bg-card p-4",
                        label === "Notes" && "sm:col-span-2",
                      )}
                    >
                      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
                      <div
                        className={cn(
                          "mt-2 text-sm font-semibold text-foreground",
                          label.includes("Mileage") && "font-ibm-plex-mono",
                          label === "Notes" && "whitespace-pre-wrap font-normal leading-6",
                        )}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-5">
              <div className="-mx-4 overflow-hidden border-y border-border sm:mx-0 sm:rounded-lg sm:border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-4 text-xs">Period</TableHead>
                      <TableHead className="text-xs">Client</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-right text-xs">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                          No rental history for this vehicle
                        </TableCell>
                      </TableRow>
                    ) : (
                      history.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/contracts/${row.contract_id}`)}
                        >
                          <TableCell className="px-4">
                            <div className="font-ibm-plex-mono text-xs text-foreground">
                              {formatDate(row.start_date)} – {formatDate(row.end_date)}
                            </div>
                            {row.source === "swap" && (
                              <div className="mt-1 text-[11px] text-muted-foreground">Swap period</div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate text-sm text-foreground">
                            {row.client_name}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("text-[11px]", getStatusBadgeClass(row.status))}>
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-ibm-plex-mono text-xs text-foreground">
                            {formatAed(row.rate_amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={editCarOpen} onOpenChange={setEditCarOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit vehicle</DialogTitle>
            <DialogDescription>Update vehicle details for this fleet record.</DialogDescription>
          </DialogHeader>
          {carForm && (
            <form onSubmit={handleCarSubmit} className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="plate">Plate Number</Label>
                  <Input
                    id="plate"
                    required
                    value={carForm.plate}
                    onChange={(event) => setCarForm({ ...carForm, plate: event.target.value })}
                    className="font-ibm-plex-mono"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    required
                    type="number"
                    min={1990}
                    max={2100}
                    value={carForm.year}
                    onChange={(event) => setCarForm({ ...carForm, year: Number(event.target.value) })}
                    className="font-ibm-plex-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="make">Make</Label>
                  <Input
                    id="make"
                    required
                    value={carForm.make}
                    onChange={(event) => setCarForm({ ...carForm, make: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    required
                    value={carForm.model}
                    onChange={(event) => setCarForm({ ...carForm, model: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="color">Color</Label>
                  <Input
                    id="color"
                    value={carForm.color}
                    onChange={(event) => setCarForm({ ...carForm, color: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={carForm.status}
                    onValueChange={(value) => setCarForm({ ...carForm, status: value as CarStatus })}
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="mulkiya">Mulkiya Expiry</Label>
                  <Input
                    id="mulkiya"
                    type="date"
                    value={carForm.mulkiya_expiry}
                    onChange={(event) => setCarForm({ ...carForm, mulkiya_expiry: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="insurance">Insurance Expiry</Label>
                  <Input
                    id="insurance"
                    type="date"
                    value={carForm.insurance_expiry}
                    onChange={(event) => setCarForm({ ...carForm, insurance_expiry: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tag_number">Salik Tag Number</Label>
                <Input
                  id="tag_number"
                  value={carForm.tag_number}
                  onChange={(event) => setCarForm({ ...carForm, tag_number: event.target.value })}
                  className="font-ibm-plex-mono"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditCarOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingCar} className="gap-2">
                  {savingCar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editMaintenanceOpen} onOpenChange={setEditMaintenanceOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit maintenance</DialogTitle>
            <DialogDescription>Save the latest service and mileage details for this vehicle.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMaintenanceSubmit} className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="last_service_date">Last Service Date</Label>
                <Input
                  id="last_service_date"
                  type="date"
                  value={maintenanceForm.last_service_date}
                  onChange={(event) =>
                    setMaintenanceForm({ ...maintenanceForm, last_service_date: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="next_service_date">Next Service Date</Label>
                <Input
                  id="next_service_date"
                  type="date"
                  value={maintenanceForm.next_service_date}
                  onChange={(event) =>
                    setMaintenanceForm({ ...maintenanceForm, next_service_date: event.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="current_mileage">Current Mileage</Label>
              <Input
                id="current_mileage"
                type="number"
                min="0"
                inputMode="numeric"
                value={maintenanceForm.current_mileage}
                onChange={(event) =>
                  setMaintenanceForm({ ...maintenanceForm, current_mileage: event.target.value })
                }
                className="font-ibm-plex-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="oil_change_date">Oil Change Date</Label>
                <Input
                  id="oil_change_date"
                  type="date"
                  value={maintenanceForm.oil_change_date}
                  onChange={(event) =>
                    setMaintenanceForm({ ...maintenanceForm, oil_change_date: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="oil_change_mileage">Oil Change Mileage</Label>
                <Input
                  id="oil_change_mileage"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={maintenanceForm.oil_change_mileage}
                  onChange={(event) =>
                    setMaintenanceForm({ ...maintenanceForm, oil_change_mileage: event.target.value })
                  }
                  className="font-ibm-plex-mono"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="maintenance_notes">Notes</Label>
              <Textarea
                id="maintenance_notes"
                value={maintenanceForm.notes}
                onChange={(event) => setMaintenanceForm({ ...maintenanceForm, notes: event.target.value })}
                className="min-h-24"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditMaintenanceOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingMaintenance} className="gap-2">
                {savingMaintenance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Maintenance
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default FleetDetail;
