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
  car: Car | null;
}

export const VehicleHistorySheet: React.FC<VehicleHistorySheetProps> = ({
  contractId,
  open,
  onClose,
}) => {
  const { toast } = useToast();
  const [history, setHistory] = useState<CombinedVehicleHistory[]>([]);
  const [loading, setLoading] = useState(false);

  // Helper to format timestamps to "DD MMM HH:mm" using plain JS
  const formatDateTimeline = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${hh}:${mm}`;
  };

  // Helper to format duration to "Xd Xh" or "ongoing"
  const calculateDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return "ongoing";
    
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    const diffMs = Math.max(0, end - start);
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffHours / 24);
    const hours = diffHours % 24;
    
    return `${days}d ${hours}h`;
  };

  const calculateDays = (startedAt: string, endedAt: string | null) => {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const diffMs = Math.max(0, end - start);
    const days = diffMs / (1000 * 60 * 60 * 24);

    return Math.round(days * 100) / 100;
  };

  const formatDays = (days: number) => {
    if (Number.isInteger(days)) return String(days);
    return days.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  };

  const formatAed = (amount: number) =>
    `AED ${Math.round(amount).toLocaleString()}`;

  const grandTotal = history.reduce((sum, item) => {
    if (!item.daily_rate) return sum;
    return sum + calculateDays(item.started_at, item.ended_at) * item.daily_rate;
  }, 0);

  useEffect(() => {
    if (open && contractId) {
      const fetchHistory = async () => {
        setLoading(true);
        try {
          const extendedDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;
          const { data: vehiclesData, error: vehiclesError } = await extendedDb
            .from("contract_vehicles")
            .select("*")
            .eq("contract_id", contractId)
            .order("started_at", { ascending: true });

          if (vehiclesError) throw vehiclesError;

          if (vehiclesData && vehiclesData.length > 0) {
            const carIds = Array.from(new Set(vehiclesData.map((v) => v.car_id)));
            const { data: carsData, error: carsError } = await supabase
              .from("cars")
              .select("id, plate, make, model, year")
              .in("id", carIds);

            if (carsError) throw carsError;

            const carMap = new Map(carsData?.map((car) => [car.id, car]));
            const combined = vehiclesData.map((v) => ({
              ...v,
              car: carMap.get(v.car_id) || null,
            }));
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
                const days = calculateDays(item.started_at, item.ended_at);
                const rowTotal = item.daily_rate ? days * item.daily_rate : null;
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
                          <span className="text-white/80">{formatDateTimeline(item.started_at)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-white/30 uppercase text-[9px] tracking-wider">To</span>
                          {isActive ? (
                            <span className="text-emerald-400 font-semibold">now (active)</span>
                          ) : (
                            <span className="text-white/80">{formatDateTimeline(item.ended_at!)}</span>
                          )}
                        </div>
                      </div>

                      {/* Duration Badge */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-white/40 uppercase font-dm-sans tracking-wide">Duration:</span>
                        <span className="inline-flex items-center rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-white/70 border border-white/5 font-ibm-plex-mono">
                          {calculateDuration(item.started_at, item.ended_at)}
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
                            {item.daily_rate ? formatAed(item.daily_rate) : "--"}
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
                {history.some((item) => !item.daily_rate) && (
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
