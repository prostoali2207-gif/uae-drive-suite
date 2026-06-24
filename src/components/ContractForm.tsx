import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { diffCalendarDays, parseDateInput } from "@/lib/dateUtils";

export type RateType = "Daily" | "Monthly" | "Yearly";
export type FuelLevel = "Empty" | "Quarter" | "Half" | "Three Quarters" | "Full";
export type Currency = "AED" | "USD" | "EUR";

export interface ClientOption {
  id: string;
  name: string;
}

export interface CarOption {
  id: string;
  plate: string;
  model: string;
  available: boolean;
}

export interface NewClientInput {
  fullName: string;
  phone: string;
  emiratesId: string;
  nationality: string;
}

export interface ContractFormValues {
  clientId: string;
  carId: string;
  startDate: string;
  endDate: string;
  rateType: RateType;
  rate: number;
  initialMileage: number;
  depositAmount: number;
  depositCurrency: Currency;
  fuelLevel: FuelLevel;
  specialConditions: string;
  total: number;
  durationDays: number;
}

interface ContractFormProps {
  clients: ClientOption[];
  cars: CarOption[];
  onSubmit: (values: ContractFormValues) => void;
  onCancel: () => void;
  onCreateClient: (input: NewClientInput) => ClientOption;
}

function diffDays(start: string, end: string): number {
  return diffCalendarDays(start, end);
}

function getCalendarMonths(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  if (!start || !end || end <= start) return 0;

  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  const lastDayOfTargetMonth = new Date(start.getFullYear(), start.getMonth() + months + 1, 0).getDate();
  const anniversary = new Date(
    start.getFullYear(),
    start.getMonth() + months,
    Math.min(start.getDate(), lastDayOfTargetMonth),
  );

  return Math.max(0, months - (end < anniversary ? 1 : 0));
}

function computeTotal(rateType: RateType, rate: number, days: number, startDate: string, endDate: string): number {
  if (!rate || !days) return 0;
  if (rateType === "Daily") return rate * days;
  if (rateType === "Monthly") return rate * getCalendarMonths(startDate, endDate);
  return rate * (days / 365);
}

const rateLabel: Record<RateType, string> = {
  Daily: "Daily Rate (AED)",
  Monthly: "Monthly Rate (AED)",
  Yearly: "Yearly Rate (AED)",
};

const fuelLevels: FuelLevel[] = ["Empty", "Quarter", "Half", "Three Quarters", "Full"];
const currencies: Currency[] = ["AED", "USD", "EUR"];

export const ContractForm = ({ clients, cars, onSubmit, onCancel, onCreateClient }: ContractFormProps) => {
  const [clientId, setClientId] = useState("");
  const [carId, setCarId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rateType, setRateType] = useState<RateType>("Daily");
  const [rate, setRate] = useState<number>(100);
  const [initialMileage, setInitialMileage] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [depositCurrency, setDepositCurrency] = useState<Currency>("AED");
  const [fuelLevel, setFuelLevel] = useState<FuelLevel>("Full");
  const [specialConditions, setSpecialConditions] = useState("");

  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState<NewClientInput>({
    fullName: "",
    phone: "",
    emiratesId: "",
    nationality: "",
  });

  const days = useMemo(() => diffDays(startDate, endDate), [startDate, endDate]);
  const total = useMemo(
    () => computeTotal(rateType, Number(rate || 0), days, startDate, endDate),
    [rateType, rate, days, startDate, endDate],
  );

  const availableCars = cars.filter((c) => c.available);

  const handleSaveNewClient = () => {
    if (!newClient.fullName.trim()) return;
    const created = onCreateClient(newClient);
    setClientId(created.id);
    setShowNewClient(false);
    setNewClient({ fullName: "", phone: "", emiratesId: "", nationality: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !carId) return;
    onSubmit({
      clientId,
      carId,
      startDate,
      endDate,
      rateType,
      rate: Number(rate),
      initialMileage: Number(initialMileage),
      depositAmount: Number(depositAmount),
      depositCurrency,
      fuelLevel,
      specialConditions,
      total,
      durationDays: days,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 py-2">
      {/* Client */}
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="client">Client</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setShowNewClient((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Client
          </Button>
        </div>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger id="client">
            <SelectValue placeholder="Select a client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showNewClient && (
          <div className="mt-2 grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="nc-name" className="text-xs">Full Name</Label>
                <Input
                  id="nc-name"
                  value={newClient.fullName}
                  onChange={(e) => setNewClient({ ...newClient, fullName: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nc-phone" className="text-xs">Phone</Label>
                <Input
                  id="nc-phone"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nc-eid" className="text-xs">Emirates ID</Label>
                <Input
                  id="nc-eid"
                  value={newClient.emiratesId}
                  onChange={(e) => setNewClient({ ...newClient, emiratesId: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nc-nat" className="text-xs">Nationality</Label>
                <Input
                  id="nc-nat"
                  value={newClient.nationality}
                  onChange={(e) => setNewClient({ ...newClient, nationality: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewClient(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSaveNewClient}>
                Save Client
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Car */}
      <div className="grid gap-1.5">
        <Label htmlFor="car">Car (Available only)</Label>
        <Select value={carId} onValueChange={setCarId}>
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

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="start">Start Date</Label>
          <Input id="start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end">End Date</Label>
          <Input id="end" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      {/* Rate Type & Rate */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="rateType">Rate Type</Label>
          <Select value={rateType} onValueChange={(v) => setRateType(v as RateType)}>
            <SelectTrigger id="rateType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Daily">Daily</SelectItem>
              <SelectItem value="Monthly">Monthly</SelectItem>
              <SelectItem value="Yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rate">{rateLabel[rateType]}</Label>
          <Input
            id="rate"
            type="number"
            min={0}
            required
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Mileage & Fuel */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="mileage">Initial Mileage (km)</Label>
          <Input
            id="mileage"
            type="number"
            min={0}
            value={initialMileage}
            onChange={(e) => setInitialMileage(Number(e.target.value))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fuel">Fuel Level at Pickup</Label>
          <Select value={fuelLevel} onValueChange={(v) => setFuelLevel(v as FuelLevel)}>
            <SelectTrigger id="fuel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fuelLevels.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Deposit */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="deposit">Deposit Amount</Label>
          <Input
            id="deposit"
            type="number"
            min={0}
            value={depositAmount}
            onChange={(e) => setDepositAmount(Number(e.target.value))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="currency">Deposit Currency</Label>
          <Select value={depositCurrency} onValueChange={(v) => setDepositCurrency(v as Currency)}>
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Special Conditions */}
      <div className="grid gap-1.5">
        <Label htmlFor="conditions">Special Conditions</Label>
        <Textarea
          id="conditions"
          rows={3}
          placeholder="Mileage limits, return location, additional drivers, etc."
          value={specialConditions}
          onChange={(e) => setSpecialConditions(e.target.value)}
        />
      </div>

      {/* Total - sticky footer summary */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
        <div>
          <div className="text-xs text-muted-foreground">Total Amount</div>
          <div className="text-lg font-semibold text-foreground">
            AED {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{days} days</div>
          <div>{rateType.toLowerCase()} rate</div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Create Contract</Button>
      </DialogFooter>
    </form>
  );
};
