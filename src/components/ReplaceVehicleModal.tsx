import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { Calculator } from "lucide-react";
import {
  findVehicleContractOverlap,
  formatContractOverlapMessage,
  parseContractDateTime,
} from "@/lib/contractOverlap";

// Define the interface to support the missing contract_vehicles table
interface ExtendedDatabase extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      contract_vehicles: {
        Row: {
          id: string;
          contract_id: string;
          car_id: string;
          started_at: string;
          ended_at: string | null;
          owner_id: string;
          created_at: string;
          daily_rate: number | null;
        };
        Insert: {
          id?: string;
          contract_id: string;
          car_id: string;
          started_at: string;
          ended_at?: string | null;
          owner_id: string;
          created_at?: string;
          daily_rate: number;
        };
        Update: {
          id?: string;
          contract_id?: string;
          car_id?: string;
          started_at?: string;
          ended_at?: string | null;
          owner_id?: string;
          created_at?: string;
          daily_rate?: number | null;
        };
        Relationships: [];
      };
    };
  };
}

interface ReplaceVehicleModalProps {
  contractId: string;
  currentCarId: string;
  contractStartDate: string; // ISO date string
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Car {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
}

interface ContractPeriod {
  id: string;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  rate_type: string;
  rate_amount: number | string;
}

interface ActiveVehiclePeriod {
  started_at: string;
  daily_rate: number | null;
}

interface ContractFeePeriod {
  id: string;
  label: string;
  amount: number;
  extension_start: string | null;
  extension_end: string | null;
  created_at: string | null;
}

interface VehicleRatePeriod {
  started_at: string;
  ended_at: string | null;
  daily_rate: number | null;
}

interface RentalPeriod {
  id: string;
  type: "contract" | "fee";
  start: string;
  end: string;
  amount: number;
  daily_rate: number;
}

function splitDatetimeLocal(value: string) {
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  };
}

const DAY_MS = 86_400_000;

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const calculateInclusiveDays = (start: Date, end: Date) => {
  const startDay = startOfLocalDay(start);
  const endDay = startOfLocalDay(end);
  const diffDays = Math.floor((endDay.getTime() - startDay.getTime()) / DAY_MS) + 1;
  return Math.max(0, diffDays);
};

const calculateInclusiveDateKeyDays = (startKey: string, endKey: string) =>
  calculateInclusiveDays(new Date(`${startKey}T00:00:00`), new Date(`${endKey}T00:00:00`));

const formatAed = (amount: number) =>
  Number.isFinite(amount)
    ? amount.toLocaleString("en-AE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "--";

function calculateContractDailyRate(rateType: string, rateAmount: number | string) {
  const amount = Number(rateAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  switch (rateType) {
    case "Monthly":
      return amount / 30;
    case "Yearly":
      return Math.round(amount / 365);
    default:
      return Math.round(amount);
  }
}

const parseRentalExtensionPeriod = (label: string) => {
  const match = label
    .trim()
    .match(/^Rental Extension:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/i);

  if (!match) return null;
  return { periodStart: match[1], periodEnd: match[2] };
};

const isInsidePeriod = (date: Date, start: Date, end: Date) =>
  date >= start && date <= end;

const toLocalDateKey = (date: Date) => date.toLocaleDateString("en-CA");

const isInsideLocalDatePeriod = (date: Date, start: Date, end: Date) =>
  toLocalDateKey(date) >= toLocalDateKey(start) && toLocalDateKey(date) <= toLocalDateKey(end);

const toPeriodDateKey = (date: string) => date.split("T")[0];

const isInsideRentalPeriod = (dateKey: string, period: RentalPeriod) =>
  dateKey >= toPeriodDateKey(period.start) && dateKey <= toPeriodDateKey(period.end);

const calculateOverlapDays = (start: Date, end: Date, periodStart: Date, periodEnd: Date) => {
  const overlapStart = new Date(Math.max(start.getTime(), periodStart.getTime()));
  const overlapEnd = new Date(Math.min(end.getTime(), periodEnd.getTime()));
  const diffMs = overlapEnd.getTime() - overlapStart.getTime();

  if (diffMs <= 0) return 0;
  return diffMs / 86_400_000;
};

const calculatePeriodDays = (periodStart: Date, periodEnd: Date) =>
  Math.max(0, (periodEnd.getTime() - periodStart.getTime()) / 86_400_000);

const calculateFixedMonthlyBillableDays = (periodStart: Date, periodEnd: Date) => {
  const calendarDays = calculatePeriodDays(periodStart, periodEnd);
  const wholeMonths =
    periodStart.getDate() === periodEnd.getDate()
      ? (periodEnd.getFullYear() - periodStart.getFullYear()) * 12 +
        (periodEnd.getMonth() - periodStart.getMonth())
      : 0;

  if (wholeMonths > 0) return wholeMonths * 30;
  if (calendarDays >= 28 && calendarDays <= 31) return 30;
  return calendarDays;
};

const calculateRentalPeriodAmount = (
  vehicles: VehicleRatePeriod[],
  periodStart: Date,
  periodEnd: Date,
) => {
  const calendarDays = calculatePeriodDays(periodStart, periodEnd);
  const billableDays = calculateFixedMonthlyBillableDays(periodStart, periodEnd);
  const billableScale = calendarDays > 0 ? billableDays / calendarDays : 0;

  return Math.round(
    vehicles.reduce((sum, vehicle) => {
      const dailyRate = Number(vehicle.daily_rate);
      if (!Number.isFinite(dailyRate) || dailyRate <= 0) return sum;

      const vehicleStart = new Date(vehicle.started_at);
      const vehicleEnd = vehicle.ended_at ? new Date(vehicle.ended_at) : periodEnd;
      if (Number.isNaN(vehicleStart.getTime()) || Number.isNaN(vehicleEnd.getTime())) return sum;

      return sum + calculateOverlapDays(vehicleStart, vehicleEnd, periodStart, periodEnd) * billableScale * dailyRate;
    }, 0),
  );
};

export const ReplaceVehicleModal: React.FC<ReplaceVehicleModalProps> = ({
  contractId,
  currentCarId,
  contractStartDate,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  
  const [availableCars, setAvailableCars] = useState<Car[]>([]);
  const [loadingCars, setLoadingCars] = useState(false);
  const [currentCar, setCurrentCar] = useState<Car | null>(null);
  const [loadingCurrentCar, setLoadingCurrentCar] = useState(false);
  const [loadingRentalPeriods, setLoadingRentalPeriods] = useState(false);
  const [rentalPeriods, setRentalPeriods] = useState<RentalPeriod[]>([]);
  const [selectedNewCarId, setSelectedNewCarId] = useState<string>("");
  
  const [replacementTime, setReplacementTime] = useState<string>("");
  const [currentMonthlyPrice, setCurrentMonthlyPrice] = useState<string>("");
  const [monthlyPrice, setMonthlyPrice] = useState<string>("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  const currentMonthlyPriceNumber = Number(currentMonthlyPrice);
  const currentPreviewDailyRate =
    Number.isFinite(currentMonthlyPriceNumber) && currentMonthlyPriceNumber > 0
      ? currentMonthlyPriceNumber / 30
      : 0;
  const monthlyPriceNumber = Number(monthlyPrice);
  const previewDailyRate =
    Number.isFinite(monthlyPriceNumber) && monthlyPriceNumber > 0
      ? monthlyPriceNumber / 30
      : 0;
  const swapCostPreview = useMemo(() => {
    const swapDate = new Date(replacementTime);
    if (Number.isNaN(swapDate.getTime())) return null;
    const swapDateKey = toLocalDateKey(swapDate);

    const containingPeriod = rentalPeriods.find((period) => isInsideRentalPeriod(swapDateKey, period));

    if (!containingPeriod) return null;

    const periodStartKey = toPeriodDateKey(containingPeriod.start);
    const periodEndKey = toPeriodDateKey(containingPeriod.end);
    if (!periodStartKey || !periodEndKey) return null;

    const oldCarDays = Math.min(calculateInclusiveDateKeyDays(periodStartKey, swapDateKey), 30);
    const newCarDays = Math.min(calculateInclusiveDateKeyDays(swapDateKey, periodEndKey), 30);
    const oldCarDailyRate = currentPreviewDailyRate;
    const newCarDailyRate = previewDailyRate;
    const oldCarTotal =
      Number.isFinite(oldCarDailyRate) && oldCarDailyRate > 0 ? oldCarDays * oldCarDailyRate : 0;
    const newCarTotal =
      Number.isFinite(newCarDailyRate) && newCarDailyRate > 0 ? newCarDays * newCarDailyRate : 0;

    return {
      oldCarDays,
      oldCarDailyRate,
      oldCarTotal,
      newCarDays,
      newCarDailyRate,
      newCarTotal,
      total: oldCarTotal + newCarTotal,
    };
  }, [currentPreviewDailyRate, previewDailyRate, replacementTime, rentalPeriods]);

  // Helper to format a Date object into local datetime-local string (YYYY-MM-DDTHH:MM)
  const formatDatetimeLocal = (date: Date) => {
    const pad = (num: number) => String(num).padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  // Reset values when modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const formatted = formatDatetimeLocal(now);
      setReplacementTime(formatted);
      setSelectedNewCarId("");
      setCurrentCar(null);
      setCurrentMonthlyPrice("");
      setMonthlyPrice("");
      setRentalPeriods([]);
      
      const fetchModalData = async () => {
        setLoadingCars(true);
        setLoadingCurrentCar(true);
        setLoadingRentalPeriods(true);
        try {
          const extendedDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;
          const [availableRes, currentRes, contractRes, feePeriodsRes, activeVehicleRes] = await Promise.all([
            supabase
              .from("cars")
              .select("id, plate, make, model, year")
              .eq("status", "Available")
              .order("plate"),
            supabase
              .from("cars")
              .select("id, plate, make, model, year")
              .eq("id", currentCarId)
              .maybeSingle(),
            extendedDb
              .from("contracts")
              .select("id, start_date, start_time, end_date, end_time, rate_type, rate_amount")
              .eq("id", contractId)
              .maybeSingle(),
            (extendedDb as any)
              .from("contract_fees")
              .select("id, amount, extension_start, extension_end, created_at")
              .eq("contract_id", contractId)
              .not("extension_start", "is", null)
              .order("extension_start", { ascending: true }),
            extendedDb
              .from("contract_vehicles")
              .select("daily_rate")
              .eq("contract_id", contractId)
              .eq("car_id", currentCarId)
              .is("ended_at", null)
              .maybeSingle(),
          ]);

          if (availableRes.error) throw availableRes.error;
          setAvailableCars((availableRes.data as Car[]) || []);

          if (currentRes.error) throw currentRes.error;
          setCurrentCar(currentRes.data as Car | null);

          if (contractRes.error) throw contractRes.error;
          if (feePeriodsRes.error) throw feePeriodsRes.error;
          if (activeVehicleRes.error) throw activeVehicleRes.error;
          const activeVehicleDailyRate = Number((activeVehicleRes.data as ActiveVehiclePeriod | null)?.daily_rate);
          setCurrentMonthlyPrice(
            Number.isFinite(activeVehicleDailyRate) && activeVehicleDailyRate > 0
              ? String(activeVehicleDailyRate * 30)
              : "",
          );
          const contractPeriod = contractRes.data as ContractPeriod | null;
          const contractDailyRate = contractPeriod
            ? calculateContractDailyRate(contractPeriod.rate_type, contractPeriod.rate_amount)
            : 0;
          const originalPeriod =
            contractPeriod && contractDailyRate > 0
              ? [
                  {
                    id: contractPeriod.id,
                    type: "contract" as const,
                    start: contractPeriod.start_date,
                    end: contractPeriod.end_date,
                    amount: contractDailyRate * 30,
                    daily_rate: contractDailyRate,
                  },
                ]
              : [];
          const extensionPeriods = ((feePeriodsRes.data ?? []) as ContractFeePeriod[])
            .filter((fee) => fee.extension_start && fee.extension_end)
            .map((fee) => ({
              id: fee.id,
              type: "fee" as const,
              start: fee.extension_start!,
              end: fee.extension_end!,
              amount: Number(fee.amount),
              daily_rate: Number(fee.amount) / 30,
            }))
            .filter((period) => Number.isFinite(period.daily_rate) && period.daily_rate > 0);
          setRentalPeriods([...originalPeriod, ...extensionPeriods]);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("Error fetching modal data:", err);
          toast({
            title: "Error",
            description: `Failed to load vehicles data: ${message}`,
            variant: "destructive",
          });
        } finally {
          setLoadingCars(false);
          setLoadingCurrentCar(false);
          setLoadingRentalPeriods(false);
        }
      };

      fetchModalData();
    }
  }, [isOpen, contractId, currentCarId, toast]);

  const handleConfirm = async () => {
    if (!selectedNewCarId) return;
    if (!Number.isFinite(monthlyPriceNumber) || monthlyPriceNumber <= 0) {
      toast({
        title: "Monthly price required",
        description: "Enter a positive monthly price for the replacement vehicle.",
        variant: "destructive",
      });
      return;
    }
    const dailyRate = Number(monthlyPrice) / 30;

    setConfirmLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user session found");
      const userId = user.id;

      // Cast supabase client to ExtendedDatabase to handle contract_vehicles
      const extendedDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;

      const replacement = splitDatetimeLocal(replacementTime);
      const [
        { data: contractPeriod, error: contractPeriodError },
        { data: activeVehicle, error: activeVehicleError },
        { data: feePeriods, error: feePeriodsError },
      ] =
        await Promise.all([
          extendedDb
            .from("contracts")
            .select("id, start_date, start_time, end_date, end_time, rate_type, rate_amount")
            .eq("id", contractId)
            .single(),
          extendedDb
            .from("contract_vehicles")
            .select("started_at, daily_rate")
            .eq("contract_id", contractId)
            .eq("car_id", currentCarId)
            .is("ended_at", null)
            .maybeSingle(),
          (extendedDb as any)
            .from("contract_fees")
            .select("id, label, amount, extension_start, extension_end, created_at")
            .eq("contract_id", contractId)
            .order("created_at", { ascending: true }),
        ]);
      if (contractPeriodError) throw contractPeriodError;
      if (activeVehicleError) throw activeVehicleError;
      if (feePeriodsError) throw feePeriodsError;

      const period = contractPeriod as ContractPeriod;
      const currentVehicleStartedAt =
        (activeVehicle as ActiveVehiclePeriod | null)?.started_at ??
        parseContractDateTime(period.start_date, period.start_time).toISOString();
      const replacementDate = new Date(replacementTime);
      const replacementDateKey = toLocalDateKey(replacementDate);
      const contractStart = parseContractDateTime(period.start_date, period.start_time);
      const contractEnd = parseContractDateTime(period.end_date, period.end_time);
      const currentVehicleStart = new Date(currentVehicleStartedAt);
      const activeVehicleDailyRate = Number((activeVehicle as ActiveVehiclePeriod | null)?.daily_rate);
      const currentVehicleDailyRate =
        Number.isFinite(activeVehicleDailyRate) && activeVehicleDailyRate > 0
          ? activeVehicleDailyRate
          : calculateContractDailyRate(period.rate_type, period.rate_amount);

      const contractDailyRate = calculateContractDailyRate(period.rate_type, period.rate_amount);
      const validationRentalPeriods: RentalPeriod[] = [
        {
          id: period.id,
          type: "contract",
          start: period.start_date,
          end: period.end_date,
          amount: contractDailyRate * 30,
          daily_rate: contractDailyRate,
        },
        ...((feePeriods ?? []) as ContractFeePeriod[])
          .filter((fee) => fee.extension_start && fee.extension_end)
          .map((fee) => ({
            id: fee.id,
            type: "fee" as const,
            start: fee.extension_start!,
            end: fee.extension_end!,
            amount: Number(fee.amount),
            daily_rate: Number(fee.amount) / 30,
          })),
      ];
      const matchingRentalPeriod = validationRentalPeriods.find((rentalPeriod) =>
        isInsideRentalPeriod(replacementDateKey, rentalPeriod),
      );

      if (Number.isNaN(replacementDate.getTime()) || !matchingRentalPeriod) {
        toast({
          title: "Invalid replacement time",
          description: "Replacement date and time must be inside the contract period.",
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      const activeRentalTarget =
        matchingRentalPeriod.type === "fee"
          ? {
              type: "fee" as const,
              id: matchingRentalPeriod.id,
              periodStart: parseContractDateTime(matchingRentalPeriod.start, period.end_time),
              periodEnd: parseContractDateTime(matchingRentalPeriod.end, period.end_time),
            }
          : {
              type: "contract" as const,
              periodStart: contractStart,
              periodEnd: contractEnd,
            };

      if (!activeRentalTarget) {
        toast({
          title: "Rental period not found",
          description: "Could not find the active rental charge for this replacement date.",
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      if (Number.isNaN(currentVehicleStart.getTime()) || replacementDate < currentVehicleStart) {
        toast({
          title: "Invalid replacement time",
          description: "Replacement date and time must be after the current vehicle start time.",
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      const replacementTimestamp = new Date(`${replacement.date}T${replacement.time}:00+04:00`).toISOString();

      const conflict = await findVehicleContractOverlap(extendedDb, {
        carId: selectedNewCarId,
        startDate: replacement.date,
        startTime: replacement.time,
        endDate: matchingRentalPeriod.end,
        endTime: period.end_time,
        excludeContractId: contractId,
        operation: "vehicle-replacement",
      });
      if (conflict) {
        toast({
          title: "Vehicle unavailable",
          description: formatContractOverlapMessage(conflict),
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      // a. Close the active contract_vehicles row for the old car
      const { data: closedVehicles, error: errOldVehicle } = await extendedDb
        .from("contract_vehicles")
        .update({
          ended_at: replacementTimestamp,
        })
        .eq("contract_id", contractId)
        .eq("car_id", currentCarId)
        .is("ended_at", null)
        .select("id");
      if (errOldVehicle) throw errOldVehicle;

      if (!closedVehicles || closedVehicles.length === 0) {
        const { error: errOldVehicleInsert } = await extendedDb
          .from("contract_vehicles")
          .insert({
            contract_id: contractId,
            car_id: currentCarId,
            started_at: currentVehicleStartedAt,
            ended_at: replacementTimestamp,
            owner_id: userId,
            daily_rate: currentVehicleDailyRate,
          });
        if (errOldVehicleInsert) throw errOldVehicleInsert;
      }

      // b. Update contracts table: set car_id = selectedNewCarId where id = contractId
      const { error: errContract } = await extendedDb
        .from("contracts")
        .update({ car_id: selectedNewCarId })
        .eq("id", contractId);
      if (errContract) throw errContract;

      // c. Update old car in cars table: set status = 'Available' where id = currentCarId
      const { error: errOldCar } = await extendedDb
        .from("cars")
        .update({ status: "Available" })
        .eq("id", currentCarId);
      if (errOldCar) throw errOldCar;

      // d. Update new car in cars table: set status = 'Rented' where id = selectedNewCarId
      const { error: errNewCar } = await extendedDb
        .from("cars")
        .update({ status: "Rented" })
        .eq("id", selectedNewCarId);
      if (errNewCar) throw errNewCar;

      // e. Insert a row into contract_vehicles table for new car start
      const { error: errNewVehicle } = await extendedDb
        .from("contract_vehicles")
        .insert({
          contract_id: contractId,
          car_id: selectedNewCarId,
          started_at: replacementTimestamp,
          ended_at: null,
          owner_id: userId,
          daily_rate: dailyRate,
        });
      if (errNewVehicle) throw errNewVehicle;

      const { data: updatedVehiclePeriods, error: updatedVehiclePeriodsError } = await extendedDb
        .from("contract_vehicles")
        .select("started_at, ended_at, daily_rate")
        .eq("contract_id", contractId);
      if (updatedVehiclePeriodsError) throw updatedVehiclePeriodsError;

      const recalculatedAmount = calculateRentalPeriodAmount(
        (updatedVehiclePeriods ?? []) as VehicleRatePeriod[],
        activeRentalTarget.periodStart,
        activeRentalTarget.periodEnd,
      );

      if (activeRentalTarget.type === "contract") {
        const { error: errRentalAmount } = await extendedDb
          .from("contracts")
          .update({ total_amount: recalculatedAmount })
          .eq("id", contractId);
        if (errRentalAmount) throw errRentalAmount;
      } else {
        const { error: errRentalFeeAmount } = await (extendedDb as any)
          .from("contract_fees")
          .update({ amount: recalculatedAmount })
          .eq("id", activeRentalTarget.id);
        if (errRentalFeeAmount) throw errRentalFeeAmount;
      }

      toast({
        title: "Vehicle Replaced",
        description: "Vehicle replacement recorded successfully.",
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
      console.error("Replacement transaction failed:", err);
      toast({
        title: "Replacement Failed",
        description: `Failed to replace vehicle: ${message}`,
        variant: "destructive",
      });
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0F1117] border-white/10 text-white p-6 rounded-lg shadow-xl font-dm-sans">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight text-white">
            Replace Vehicle Mid-Contract
          </DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            Record the replacement time and assign the new vehicle to Contract:{" "}
            <span className="font-ibm-plex-mono text-white bg-white/5 px-1.5 py-0.5 rounded text-xs">
              {contractId.slice(0, 8).toUpperCase()}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4 border-t border-b border-white/10 py-6">
          {/* Section 1 — Current Vehicle End */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white/90 border-b border-white/5 pb-2">
              Section 1 — Current Vehicle End
            </h3>
            
            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Current Vehicle
              </Label>
              <div className="font-ibm-plex-mono bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-2 text-sm text-white/70">
                {loadingCurrentCar ? (
                  <span className="text-xs text-white/40 italic">Loading vehicle info...</span>
                ) : currentCar ? (
                  `${currentCar.plate} — ${currentCar.make} ${currentCar.model} (${currentCar.year})`
                ) : (
                  currentCarId.slice(0, 8).toUpperCase()
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="current-monthly-price" className="text-xs text-white/50 uppercase tracking-wider">
                Monthly price
              </Label>
              <Input
                id="current-monthly-price"
                type="number"
                min="1"
                step="1"
                inputMode="decimal"
                value={currentMonthlyPrice}
                onChange={(e) => setCurrentMonthlyPrice(e.target.value)}
                placeholder="AED per month"
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
              <div className="text-[11px] text-white/45 font-ibm-plex-mono">
                Daily rate: {currentPreviewDailyRate > 0 ? `AED ${formatAed(currentPreviewDailyRate)}` : "AED --"}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="replacement-time" className="text-xs text-white/50 uppercase tracking-wider">
                Replacement date & time
              </Label>
              <Input
                id="replacement-time"
                type="datetime-local"
                value={replacementTime}
                onChange={(e) => setReplacementTime(e.target.value)}
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          {/* Section 2 — New Vehicle */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white/90 border-b border-white/5 pb-2">
              Section 2 — New Vehicle
            </h3>

            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Available Vehicles
              </Label>
              {loadingCars ? (
                <div className="text-xs text-white/60 italic py-2">Loading available fleet...</div>
              ) : availableCars.length === 0 ? (
                <div className="text-xs text-destructive italic py-2">No available cars found in fleet.</div>
              ) : (
                <Select value={selectedNewCarId} onValueChange={setSelectedNewCarId}>
                  <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Select new vehicle" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-white/10 text-white max-h-56">
                    {availableCars.map((car) => (
                      <SelectItem 
                        key={car.id} 
                        value={car.id}
                        className="focus:bg-[#1a1a1a] focus:text-white"
                      >
                        <span className="font-ibm-plex-mono mr-2">{car.plate}</span> — {car.make} {car.model} ({car.year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="replacement-monthly-price" className="text-xs text-white/50 uppercase tracking-wider">
                Monthly price
              </Label>
              <Input
                id="replacement-monthly-price"
                type="number"
                min="1"
                step="1"
                inputMode="decimal"
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                placeholder="AED per month"
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/25 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
              <div className="text-[11px] text-white/45 font-ibm-plex-mono">
                Daily rate: {previewDailyRate > 0 ? `AED ${formatAed(previewDailyRate)}` : "AED --"}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
            <Calculator className="h-4 w-4 text-blue-300" aria-hidden="true" />
            Swap cost calculator
          </div>

          {loadingRentalPeriods ? (
            <div className="text-sm text-white/55">Loading rental periods...</div>
          ) : swapCostPreview ? (
            <div className="space-y-2 text-sm text-white/75">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Car #1</span>
                <span className="font-ibm-plex-mono text-white">
                  {swapCostPreview.oldCarDays} days × AED {formatAed(swapCostPreview.oldCarDailyRate)} = AED{" "}
                  {formatAed(swapCostPreview.oldCarTotal)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Car #2</span>
                <span className="font-ibm-plex-mono text-white">
                  {swapCostPreview.newCarDays} days × AED {formatAed(swapCostPreview.newCarDailyRate)} = AED{" "}
                  {formatAed(swapCostPreview.newCarTotal)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-white">
                <span className="font-medium">Period total</span>
                <span className="font-ibm-plex-mono">
                  AED {formatAed(swapCostPreview.oldCarTotal)} + AED {formatAed(swapCostPreview.newCarTotal)} = AED{" "}
                  {formatAed(swapCostPreview.total)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-amber-200/80">Swap date does not fall within any rental period.</div>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </Button>
          <Button
            disabled={!selectedNewCarId || previewDailyRate <= 0 || confirmLoading}
            onClick={handleConfirm}
            className="bg-[#4f6ef7] hover:bg-[#4f6ef7]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLoading ? "Replacing..." : "Confirm Replacement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
