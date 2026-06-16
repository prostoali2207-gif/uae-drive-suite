import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { History } from "lucide-react";
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
}

interface ContractPeriod {
  id: string;
  start_date: string;
  end_date: string;
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

  // Helper to format timestamps to "DD MMM HH:mm" in Dubai time
  const formatDateTimeline = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const toDateKey = (dateStr: string) =>
    dateStr.includes("T") ? new Date(dateStr).toLocaleDateString("en-CA") : dateStr.slice(0, 10);

  const findMatchingPeriod = (dateStr: string, periods: RentalPeriod[]) => {
    const dateKey = toDateKey(dateStr);
    return periods.find((period) => {
      if (!period.extension_start || !period.extension_end) return false;
      return dateKey >= period.extension_start.slice(0, 10) && dateKey <= period.extension_end.slice(0, 10);
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
    if (!item.display_daily_rate) return sum;
    return sum + Math.round(calculateDays(item.display_started_at, item.display_ended_at) * item.display_daily_rate);
  }, 0);

  useEffect(() => {
    if (open && contractId) {
      const fetchHistory = async () => {
        setLoading(true);
        try {
          const extendedDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;
          const [vehiclesResult, feePeriodsResult, contractResult] = await Promise.all([
            extendedDb
              .from("contract_vehicles")
              .select("*")
              .eq("contract_id", contractId)
              .order("started_at", { ascending: true }),
            (extendedDb as any)
              .from("contract_fees")
              .select("id, amount, extension_start, extension_end")
              .eq("contract_id", contractId)
              .not("extension_start", "is", null)
              .order("extension_start", { ascending: true }),
            supabase
              .from("contracts")
              .select("id, start_date, end_date, rate_type, rate_amount")
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
                    },
                  ]
                : [];
            const rentalPeriods = [
              ...originalPeriod,
              ...((feePeriodsData ?? []) as RentalPeriod[]).filter(
                (period) => period.extension_start && period.extension_end,
              ),
            ];
            const combined = vehiclesData.map((v) => {
              const matchedPeriod = v.ended_at
                ? findMatchingPeriod(v.ended_at, rentalPeriods)
                : findMatchingPeriod(v.started_at, rentalPeriods);
              return {
                ...v,
                display_started_at: v.ended_at ? matchedPeriod?.extension_start ?? v.started_at : v.started_at,
                display_ended_at: v.ended_at ?? matchedPeriod?.extension_end ?? null,
                display_daily_rate: v.ended_at
                  ? matchedPeriod
                    ? Number(matchedPeriod.amount) / 30
                    : null
                  : v.daily_rate,
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
      };

      fetchHistory();
    }
  }, [open, contractId, toast]);

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
                const rowTotal = item.display_daily_rate ? Math.round(days * item.display_daily_rate) : null;
                return (
                  <div key={item.id} className="relative pl-6 pb-8 last:pb-2">
                    {/* Connector Line */}
                    {index < history.length - 1 && (
                      <div className="absolute left-[5px] top-[14px] bottom-0 w-[2px] bg-white/7" />
                    )}

                    {/* Timeline Dot */}
                    <div className="absolute left-0 top-[4px] z-10">
                      {isActive ? (
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                      ) : (
                        <div className="h-3 w-3 rounded-full bg-white/20" />
                      )}
                    </div>

                    {/* Timeline Card */}
                    <div className="space-y-1">
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
                        
                        {/* Status Pill */}
                        {isActive ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                            active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-medium text-white/40 border border-white/5 uppercase tracking-wider">
                            returned
                          </span>
                        )}
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
                            {item.display_daily_rate ? formatAed(item.display_daily_rate) : "--"}
                          </div>
                        </div>
                        <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
                          <div className="text-[9px] uppercase tracking-wider text-white/30">Total</div>
                          <div className="text-xs font-semibold text-white/90">
                            {rowTotal === null ? "--" : formatAed(rowTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 border-t border-white/7 pt-4">
                <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 font-ibm-plex-mono">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Grand Total</span>
                  <span className="text-sm font-semibold text-white">{formatAed(grandTotal)}</span>
                </div>
                {history.some((item) => !item.display_daily_rate) && (
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
