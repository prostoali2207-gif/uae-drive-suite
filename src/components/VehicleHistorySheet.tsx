import React, { useCallback, useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { History, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { SupabaseClient } from "@supabase/supabase-js";

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
          daily_rate?: number | null;
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

interface VehicleHistorySheetProps {
  contractId: string;
  open: boolean;
  onClose: () => void;
}

interface Car {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  status?: string;
}

interface CombinedVehicleHistory {
  id: string;
  contract_id: string;
  car_id: string;
  started_at: string;
  ended_at: string | null;
  owner_id: string;
  created_at: string;
  daily_rate: number | null;
  display_started_at: string;
  display_ended_at: string | null;
  display_daily_rate: number | null;
  car: Car | null;
}

interface RentalPeriod {
  id: string;
  amount: number;
  extension_start: string | null;
  extension_end: string | null;
  start_time: string | null;
  end_time: string | null;
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

export const VehicleHistorySheet: React.FC<VehicleHistorySheetProps> = ({
  contractId,
  open,
  onClose,
}) => {
  const { toast } = useToast();
  const [history, setHistory] = useState<CombinedVehicleHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableCars, setAvailableCars] = useState<Car[]>([]);
  const [swapDateTime, setSwapDateTime] = useState("");
  const [firstDailyRate, setFirstDailyRate] = useState("");
  const [secondDailyRate, setSecondDailyRate] = useState("");
  const [replacementCarId, setReplacementCarId] = useState("");

  // Helper to format timestamps to "DD MMM HH:mm" in Dubai time
  const formatDateTimeline = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-GB", {
      timeZone: "Asia/Dubai",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
  };

  const toDateKey = (dateStr: string) =>
    dateStr.includes("T")
      ? new Date(dateStr).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" })
      : dateStr.slice(0, 10);

  const toDubaiTimestamp = (dateKey: string, time: string | null | undefined) =>
    new Date(`${dateKey}T${(time || "00:00").slice(0, 5)}:00+04:00`).toISOString();

  const findMatchingPeriod = (dateStr: string, periods: RentalPeriod[]) => {
    const dateKey = toDateKey(dateStr);
    return [...periods]
      .filter((period) => {
        if (!period.extension_start || !period.extension_end) return false;
        return dateKey >= period.extension_start.slice(0, 10) && dateKey <= period.extension_end.slice(0, 10);
      })
      .sort((a, b) => String(b.extension_start).localeCompare(String(a.extension_start)))[0];
  };

  const findCurrentActivePeriod = (periods: RentalPeriod[]) => {
    const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
    return (
      periods.find((period) => {
        if (!period.extension_start || !period.extension_end) return false;
        return todayKey >= period.extension_start.slice(0, 10) && todayKey <= period.extension_end.slice(0, 10);
      }) ??
      [...periods]
        .filter((period) => period.extension_start && period.extension_end)
        .sort((a, b) => String(b.extension_end).localeCompare(String(a.extension_end)))[0]
    );
  };

  const getPeriodStartTimestamp = (period: RentalPeriod | undefined) =>
    period?.extension_start
      ? toDubaiTimestamp(period.extension_start.slice(0, 10), period.start_time)
      : null;

  const getPeriodEndTimestamp = (period: RentalPeriod | undefined) =>
    period?.extension_end
      ? toDubaiTimestamp(period.extension_end.slice(0, 10), period.end_time)
      : null;

  const preventReversedRange = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return { display_started_at: startedAt, display_ended_at: endedAt };

    return new Date(startedAt).getTime() <= new Date(endedAt).getTime()
      ? { display_started_at: startedAt, display_ended_at: endedAt }
      : { display_started_at: endedAt, display_ended_at: endedAt };
  };

  const buildVehicleDisplayPeriods = (
    vehicles: ExtendedDatabase["public"]["Tables"]["contract_vehicles"]["Row"][],
    rentalPeriods: RentalPeriod[],
    activePeriod: RentalPeriod | undefined,
  ) => {
    const firstReplacementAt = vehicles.find((vehicle) => vehicle.ended_at)?.ended_at;
    const firstReplacementPeriod = firstReplacementAt ? findMatchingPeriod(firstReplacementAt, rentalPeriods) : undefined;
    const firstSegmentStart = getPeriodStartTimestamp(firstReplacementPeriod);
    const currentPeriodEnd = getPeriodEndTimestamp(activePeriod);

    return vehicles.map((vehicle, index) => {
      const previousReplacementAt = index > 0 ? vehicles[index - 1]?.ended_at : null;
      const displayStartedAt =
        index === 0
          ? firstSegmentStart ?? vehicle.started_at
          : previousReplacementAt ?? vehicle.started_at;
      const displayEndedAt = vehicle.ended_at ?? currentPeriodEnd;

      return preventReversedRange(displayStartedAt, displayEndedAt);
    });
  };

  const calculateContractDailyRate = (rateType: string, rateAmount: number | string) => {
    const amount = Number(rateAmount);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (rateType === "Monthly") return amount / 30;
    if (rateType === "Yearly") return amount / 365;
    return amount;
  };

  // Helper to format duration to "Xd" or "ongoing"
  const calculateDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return "ongoing";

    return `${calculateDays(startedAt, endedAt)}d`;
  };

  const calculateDays = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return 0;

    const start = new Date(`${toDateKey(startedAt)}T00:00:00`).getTime();
    const end = new Date(`${toDateKey(endedAt)}T00:00:00`).getTime();
    const diffMs = Math.max(0, end - start);

    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const formatDays = (days: number) => {
    if (Number.isInteger(days)) return String(days);
    return days.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  };

  const formatAed = (amount: number) =>
    `AED ${Math.round(amount).toLocaleString()}`;

  const grandTotal = history.reduce((sum, item) => {
    if (item.display_daily_rate === null) return sum;
    return sum + Math.round(calculateDays(item.display_started_at, item.display_ended_at) * item.display_daily_rate);
  }, 0);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const extendedDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;
      const [vehiclesResult, feePeriodsResult, contractResult] = await Promise.all([
        extendedDb
          .from("contract_vehicles")
          .select("*")
          .eq("contract_id", contractId)
          .order("started_at", { ascending: true }),
        // contract_fees is not present in the generated database types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (extendedDb as any)
          .from("contract_fees")
          .select("id, amount, extension_start, extension_end")
          .eq("contract_id", contractId)
          .not("extension_start", "is", null)
          .order("extension_start", { ascending: true }),
        supabase
          .from("contracts")
          .select("id, start_date, start_time, end_date, end_time, rate_type, rate_amount")
          .eq("id", contractId)
          .maybeSingle(),
      ]);

      const { data: vehiclesData, error: vehiclesError } = vehiclesResult;
      const { data: feePeriodsData, error: feePeriodsError } = feePeriodsResult;
      const { data: contractData, error: contractError } = contractResult;
      if (vehiclesError) throw vehiclesError;
      if (feePeriodsError) throw feePeriodsError;
      if (contractError) throw contractError;

      if (vehiclesData && vehiclesData.length > 0) {
        const carIds = Array.from(new Set(vehiclesData.map((v) => v.car_id)));
        const { data: carsData, error: carsError } = await supabase
          .from("cars")
          .select("id, plate, make, model, year")
          .in("id", carIds);

        if (carsError) throw carsError;

        const carMap = new Map(carsData?.map((car) => [car.id, car]));
        const contractPeriod = contractData as ContractPeriod | null;
        const originalDailyRate = contractPeriod
          ? calculateContractDailyRate(contractPeriod.rate_type, contractPeriod.rate_amount)
          : 0;
        const originalPeriod =
          contractPeriod && originalDailyRate > 0
            ? [
                {
                  id: contractPeriod.id,
                  amount: originalDailyRate * 30,
                  extension_start: contractPeriod.start_date,
                  extension_end: contractPeriod.end_date,
                  start_time: contractPeriod.start_time,
                  end_time: contractPeriod.end_time,
                },
              ]
            : [];
        const rentalPeriods = [
          ...originalPeriod,
          ...((feePeriodsData ?? []) as RentalPeriod[])
            .filter((period) => period.extension_start && period.extension_end)
            .map((period) => ({
              ...period,
              start_time: contractPeriod?.end_time ?? null,
              end_time: contractPeriod?.end_time ?? null,
            })),
        ];
        const activePeriod = findCurrentActivePeriod(rentalPeriods);
        const displayPeriods = buildVehicleDisplayPeriods(vehiclesData, rentalPeriods, activePeriod);
        const combined = vehiclesData.map((v, index) => {
          const displayPeriod = displayPeriods[index];
          return {
            ...v,
            display_started_at: displayPeriod.display_started_at,
            display_ended_at: displayPeriod.display_ended_at,
            display_daily_rate: v.daily_rate === null ? null : Number(v.daily_rate),
            car: carMap.get(v.car_id) || null,
          };
        });
        setHistory(combined);
      } else {
        setHistory([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Error fetching vehicle history:", err);
      toast({
        title: "Error",
        description: `Failed to load vehicle history: ${message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  // Display-period helpers are pure and intentionally kept local to this focused component.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, toast]);

  useEffect(() => {
    if (open && contractId) {
      setEditOpen(false);
      fetchHistory();
    }
  }, [open, contractId, fetchHistory]);

  const handleEditToggle = async () => {
    if (editOpen) {
      setEditOpen(false);
      return;
    }

    const firstVehicle = history[0];
    const secondVehicle = history[1];
    if (!firstVehicle?.ended_at || !secondVehicle) return;

    setSwapDateTime(
      new Date(firstVehicle.ended_at)
        .toLocaleString("en-CA", {
          timeZone: "Asia/Dubai",
          hour12: false,
        })
        .replace(", ", "T")
        .slice(0, 16),
    );
    setFirstDailyRate(firstVehicle.daily_rate === null ? "" : String(firstVehicle.daily_rate));
    setSecondDailyRate(secondVehicle.daily_rate === null ? "" : String(secondVehicle.daily_rate));
    setReplacementCarId(secondVehicle.car_id);

    try {
      const { data, error } = await supabase
        .from("cars")
        .select("id, plate, make, model, year, status")
        .or(`status.ilike.available,id.eq.${secondVehicle.car_id}`)
        .order("make")
        .order("model");
      if (error) throw error;
      setAvailableCars((data as Car[]) ?? []);
      setEditOpen(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Error",
        description: `Failed to load replacement vehicles: ${message}`,
        variant: "destructive",
      });
    }
  };

  const handleSaveSwap = async () => {
    const firstVehicle = history[0];
    const secondVehicle = history[1];
    const firstRate = Number(firstDailyRate);
    const secondRate = Number(secondDailyRate);

    if (
      !firstVehicle ||
      !secondVehicle ||
      !swapDateTime ||
      !replacementCarId ||
      !Number.isFinite(firstRate) ||
      firstRate < 0 ||
      !Number.isFinite(secondRate) ||
      secondRate < 0
    ) {
      toast({
        title: "Invalid swap details",
        description: "Enter a swap date, replacement vehicle, and valid daily rates.",
        variant: "destructive",
      });
      return;
    }

    const swapDate = new Date(`${swapDateTime}+04:00`);
    if (Number.isNaN(swapDate.getTime())) {
      toast({
        title: "Invalid swap date",
        description: "Enter a valid Dubai date and time.",
        variant: "destructive",
      });
      return;
    }

    const swapTimestamp = swapDate.toISOString();
    const vehicleChanged = replacementCarId !== secondVehicle.car_id;
    const supabaseClient = supabase;
    const extendedDb = supabaseClient as unknown as SupabaseClient<ExtendedDatabase>;

    setSaving(true);
    try {
      const { error: firstVehicleError } = await extendedDb
        .from("contract_vehicles")
        .update({
          ended_at: swapTimestamp,
          daily_rate: firstRate,
        })
        .eq("id", firstVehicle.id);
      if (firstVehicleError) throw firstVehicleError;

      const { error: secondVehicleError } = await extendedDb
        .from("contract_vehicles")
        .update({
          started_at: swapTimestamp,
          daily_rate: secondRate,
          car_id: replacementCarId,
        })
        .eq("id", secondVehicle.id);
      if (secondVehicleError) throw secondVehicleError;

      if (vehicleChanged) {
        const { error: oldCarError } = await extendedDb
          .from("cars")
          .update({ status: "Available" })
          .eq("id", secondVehicle.car_id);
        if (oldCarError) throw oldCarError;

        const { error: newCarError } = await extendedDb
          .from("cars")
          .update({ status: "Rented" })
          .eq("id", replacementCarId);
        if (newCarError) throw newCarError;
      }

      setEditOpen(false);
      await fetchHistory();
      toast({
        title: "Vehicle swap updated",
        description: "Swap date, rates, vehicle, and totals have been refreshed.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="w-full sm:max-w-[380px] bg-[#161925] border-l border-white/7 text-white p-6 flex flex-col h-full font-dm-sans">
        <SheetHeader className="space-y-1.5 text-left border-b border-white/7 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-white/60" />
            <SheetTitle className="text-lg font-semibold text-white font-dm-sans">
              Vehicle History
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-white/50 font-dm-sans">
            {loading ? "Loading..." : `${history.length} ${history.length === 1 ? "vehicle" : "vehicles"} used`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-6 pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]">
          {loading ? (
            /* Loading State — 2 Skeleton Rows */
            <div className="animate-pulse space-y-8">
              {[1, 2].map((i) => (
                <div key={i} className="relative pl-6 pb-6">
                  {/* Connector Line */}
                  {i === 1 && (
                    <div className="absolute left-[5px] top-[14px] bottom-0 w-[2px] bg-white/5" />
                  )}
                  {/* Timeline Dot */}
                  <div className="absolute left-0 top-[4px] h-3 w-3 rounded-full bg-white/10" />
                  <div className="space-y-2">
                    <div className="h-4 bg-white/10 rounded w-2/3" />
                    <div className="h-3 bg-white/5 rounded w-1/3" />
                    <div className="h-10 bg-white/5 rounded-md w-full mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            /* Empty State */
            <div className="text-center py-12 text-sm text-white/40 italic">
              No replacements recorded
            </div>
          ) : (
            /* Timeline List */
            <div className="relative">
              {history.map((item, index) => {
                const isActive = !item.ended_at;
                const displayEndedAt = item.display_ended_at;
                const days = calculateDays(item.display_started_at, displayEndedAt);
                const rowTotal =
                  item.display_daily_rate === null ? null : Math.round(days * item.display_daily_rate);
                return (
                  <div key={item.id} className="relative pl-6 pb-8 last:pb-2">
                    {/* Connector Line */}
                    {index < history.length - 1 && (
                      <div className="absolute left-[5px] top-[14px] bottom-0 w-[2px] bg-white/7" />
                    )}

                    {/* Timeline Dot */}
                    <div className="absolute left-0 top-[4px] z-10">
                      {isActive ? (
                        <span className="flex h-3 w-3 rounded-full bg-green-400 shadow shadow-green-400/40" />
                      ) : (
                        <div className="h-3 w-3 rounded-full bg-zinc-600" />
                      )}
                    </div>

                    {/* Timeline Card */}
                    <div
                      className={`space-y-1 rounded-lg border bg-[#1c1c1f] p-3 transition ${
                        editOpen && index === 0
                          ? "border-blue-500"
                          : "border-white/5"
                      } ${editOpen && index === 1 ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Vehicle Name */}
                        <span
                          className={`font-dm-sans text-sm font-bold truncate ${
                            isActive ? "text-emerald-400" : "text-white/90"
                          }`}
                        >
                          {item.car
                            ? `${item.car.make} ${item.car.model}`
                            : "Unknown Vehicle"}
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          {/* Status Pill */}
                          {isActive ? (
                            <span className="inline-flex items-center rounded-full bg-green-950/40 px-2 py-0.5 text-[9px] font-semibold text-green-400 border border-green-500/30 uppercase tracking-wider">
                              active
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-medium text-zinc-500 uppercase tracking-wider">
                              returned
                            </span>
                          )}
                          {index === 0 && history.length > 1 && (
                            <button
                              type="button"
                              onClick={handleEditToggle}
                              aria-label={editOpen ? "Close vehicle swap editor" : "Edit vehicle swap"}
                              className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border transition-colors ${
                                editOpen
                                  ? "border-blue-500 bg-blue-900/30 text-blue-400"
                                  : "border-zinc-700 bg-transparent text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Plate and Year */}
                      <div className="font-ibm-plex-mono text-[11px] text-white/50 flex items-center gap-1.5">
                        {item.car && (
                          <>
                            <span className="bg-white/5 px-1 py-0.5 rounded border border-white/5 font-semibold text-white/70">
                              {item.car.plate}
                            </span>
                            <span>·</span>
                            <span>{item.car.year}</span>
                          </>
                        )}
                      </div>

                      {/* Date Ranges Card */}
                      <div className="mt-2.5 bg-white/[0.02] border border-white/5 rounded-md p-2.5 space-y-1.5 font-ibm-plex-mono text-xs text-white/70">
                        <div className="flex justify-between items-center">
                          <span className="text-white/30 uppercase text-[9px] tracking-wider">From</span>
                          <span className="text-white/80">{formatDateTimeline(item.display_started_at)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-white/30 uppercase text-[9px] tracking-wider">To</span>
                          {displayEndedAt ? (
                            <span className={isActive ? "text-emerald-400 font-semibold" : "text-white/80"}>
                              {formatDateTimeline(displayEndedAt)}
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-semibold">active</span>
                          )}
                        </div>
                      </div>

                      {/* Duration Badge */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-white/40 uppercase font-dm-sans tracking-wide">Duration:</span>
                        <span className="inline-flex items-center rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-white/70 border border-white/5 font-ibm-plex-mono">
                          {calculateDuration(item.display_started_at, displayEndedAt)}
                        </span>
                      </div>

                      {/* Informational Cost Breakdown */}
                      <div className="mt-2 grid grid-cols-3 gap-1.5 font-ibm-plex-mono">
                        <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
                          <div className="text-[9px] uppercase tracking-wider text-white/30">Days</div>
                          <div className="text-xs text-white/80">{formatDays(days)}</div>
                        </div>
                        <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
                          <div className="text-[9px] uppercase tracking-wider text-white/30">Daily Rate</div>
                          <div className="text-xs text-white/80">
                            {item.display_daily_rate === null ? "--" : formatAed(item.display_daily_rate)}
                          </div>
                        </div>
                        <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
                          <div className="text-[9px] uppercase tracking-wider text-white/30">Total</div>
                          <div className="text-xs font-semibold text-white/90">
                            {rowTotal === null ? "--" : formatAed(rowTotal)}
                          </div>
                        </div>
                      </div>

                      {index === 0 && editOpen && history[1] && (
                        <div className="-mx-3 -mb-3 mt-4 space-y-4 border-t border-blue-500/20 bg-[#0f1117] p-4">
                          <section>
                            <div className="mb-2 flex items-center gap-2">
                              <span className="shrink-0 text-[9px] uppercase tracking-widest text-zinc-500">
                                Swap Date
                              </span>
                              <div className="h-px flex-1 bg-zinc-800" />
                            </div>
                            <input
                              type="datetime-local"
                              value={swapDateTime}
                              onChange={(event) => setSwapDateTime(event.target.value)}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-ibm-plex-mono text-sm text-white outline-none focus:border-blue-500"
                            />
                            <p className="mt-1.5 text-[10px] text-blue-400">
                              Updates start of replacement vehicle automatically
                            </p>
                          </section>

                          <section>
                            <div className="mb-2 flex items-center gap-2">
                              <span className="shrink-0 text-[9px] uppercase tracking-widest text-zinc-500">
                                Daily Rates
                              </span>
                              <div className="h-px flex-1 bg-zinc-800" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="min-w-0">
                                <span className="mb-1 block truncate text-[10px] text-zinc-400">
                                  {item.car ? `${item.car.make} ${item.car.model}` : "First vehicle"}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={firstDailyRate}
                                  onChange={(event) => setFirstDailyRate(event.target.value)}
                                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-ibm-plex-mono text-sm text-white outline-none focus:border-blue-500"
                                />
                              </label>
                              <label className="min-w-0">
                                <span className="mb-1 block truncate text-[10px] text-zinc-400">
                                  {history[1].car
                                    ? `${history[1].car.make} ${history[1].car.model}`
                                    : "Replacement vehicle"}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={secondDailyRate}
                                  onChange={(event) => setSecondDailyRate(event.target.value)}
                                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-ibm-plex-mono text-sm text-white outline-none focus:border-blue-500"
                                />
                              </label>
                            </div>
                          </section>

                          <section>
                            <div className="mb-2 flex items-center gap-2">
                              <span className="shrink-0 text-[9px] uppercase tracking-widest text-zinc-500">
                                Replacement Vehicle
                              </span>
                              <div className="h-px flex-1 bg-zinc-800" />
                            </div>
                            <select
                              value={replacementCarId}
                              onChange={(event) => setReplacementCarId(event.target.value)}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-ibm-plex-mono text-sm text-white outline-none focus:border-blue-500"
                            >
                              {availableCars.map((car) => (
                                <option key={car.id} value={car.id}>
                                  {car.make} {car.model} — {car.plate}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1.5 text-[10px] text-amber-400">
                              Changing vehicle updates fleet status
                            </p>
                          </section>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditOpen(false)}
                              disabled={saving}
                              className="rounded-lg border border-zinc-700 py-2 text-sm text-zinc-500 transition hover:text-zinc-300 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveSwap}
                              disabled={saving}
                              className="rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 border-t border-white/7 pt-4">
                <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 font-ibm-plex-mono">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Grand Total</span>
                  <span className="text-sm font-semibold text-white">{formatAed(grandTotal)}</span>
                </div>
                {history.some((item) => item.display_daily_rate === null) && (
                  <p className="mt-2 text-[11px] text-white/35">
                    Rows without daily rate are excluded from the total.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
