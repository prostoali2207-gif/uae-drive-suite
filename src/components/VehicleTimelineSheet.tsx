import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
}

interface TimelineNode extends CombinedVehicleHistory {
  timeline_id: string;
  continues_from_previous: boolean;
}

interface PeriodGroup {
  period: RentalPeriod;
  nodes: TimelineNode[];
}

export const VehicleTimelineSheet: React.FC<VehicleHistorySheetProps> = ({
  contractId,
  open,
  onClose,
}) => {
  const { toast } = useToast();
  const [history, setHistory] = useState<CombinedVehicleHistory[]>([]);
  const [rentalPeriods, setRentalPeriods] = useState<RentalPeriod[]>([]);
  const [loading, setLoading] = useState(false);

  const formatDateTimeline = (dateStr: string) =>
    new Date(dateStr).toLocaleString("en-GB", {
      timeZone: "Asia/Dubai",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });

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
        return (
          dateKey >= period.extension_start.slice(0, 10) &&
          dateKey <= period.extension_end.slice(0, 10)
        );
      })
      .sort((a, b) =>
        String(b.extension_start).localeCompare(String(a.extension_start)),
      )[0];
  };

  const findCurrentActivePeriod = (periods: RentalPeriod[]) => {
    const todayKey = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Dubai",
    });
    return (
      periods.find((period) => {
        if (!period.extension_start || !period.extension_end) return false;
        return (
          todayKey >= period.extension_start.slice(0, 10) &&
          todayKey <= period.extension_end.slice(0, 10)
        );
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
    if (!endedAt) {
      return { display_started_at: startedAt, display_ended_at: endedAt };
    }

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
    const firstReplacementPeriod = firstReplacementAt
      ? findMatchingPeriod(firstReplacementAt, rentalPeriods)
      : undefined;
    const firstSegmentStart = getPeriodStartTimestamp(firstReplacementPeriod);
    const currentPeriodEnd = getPeriodEndTimestamp(activePeriod);

    return vehicles.map((vehicle, index) => {
      const previousReplacementAt =
        index > 0 ? vehicles[index - 1]?.ended_at : null;
      const displayStartedAt =
        index === 0
          ? firstSegmentStart ?? vehicle.started_at
          : previousReplacementAt ?? vehicle.started_at;
      const displayEndedAt = vehicle.ended_at ?? currentPeriodEnd;

      return preventReversedRange(displayStartedAt, displayEndedAt);
    });
  };

  const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

  const calculateDurationMs = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return 0;
    return Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
  };

  const calculateBillableDays = (startedAt: string, endedAt: string | null) =>
    calculateDurationMs(startedAt, endedAt) / MILLISECONDS_PER_DAY;

  const calculateDisplayedAmount = (
    startedAt: string,
    endedAt: string | null,
    dailyRate: number | null,
  ) => {
    if (dailyRate === null) return null;
    return Math.round(calculateBillableDays(startedAt, endedAt) * dailyRate);
  };

  const formatDays = (days: number) => {
    if (Number.isInteger(days)) return String(days);
    return days.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  };

  const formatAed = (amount: number) =>
    `AED ${Math.round(amount).toLocaleString()}`;

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
          .select("id, extension_start, extension_end")
          .eq("contract_id", contractId)
          .not("extension_start", "is", null)
          .order("extension_start", { ascending: true }),
        supabase
          .from("contracts")
          .select("id, start_date, start_time, end_date, end_time")
          .eq("id", contractId)
          .maybeSingle(),
      ]);

      const { data: vehiclesData, error: vehiclesError } = vehiclesResult;
      const { data: feePeriodsData, error: feePeriodsError } = feePeriodsResult;
      const { data: contractData, error: contractError } = contractResult;
      if (vehiclesError) throw vehiclesError;
      if (feePeriodsError) throw feePeriodsError;
      if (contractError) throw contractError;

      if (!vehiclesData?.length) {
        setHistory([]);
        setRentalPeriods([]);
        return;
      }

      const carIds = Array.from(new Set(vehiclesData.map((vehicle) => vehicle.car_id)));
      const { data: carsData, error: carsError } = await supabase
        .from("cars")
        .select("id, plate, make, model, year")
        .in("id", carIds);
      if (carsError) throw carsError;

      const carMap = new Map(carsData?.map((car) => [car.id, car]));
      const contractPeriod = contractData as ContractPeriod | null;
      const extensionPeriods = ((feePeriodsData ?? []) as RentalPeriod[])
        .filter((period) => period.extension_start && period.extension_end)
        .sort((a, b) =>
          String(a.extension_start).localeCompare(String(b.extension_start)),
        );
      const firstExtension = extensionPeriods[0];
      const originalPeriod =
        contractPeriod
          ? [
              {
                id: contractPeriod.id,
                extension_start: contractPeriod.start_date,
                extension_end:
                  firstExtension?.extension_start ?? contractPeriod.end_date,
                start_time: contractPeriod.start_time,
                end_time: contractPeriod.end_time,
              },
            ]
          : [];
      const rentalPeriods = [
        ...originalPeriod,
        ...extensionPeriods.map((period) => ({
          ...period,
          start_time: contractPeriod?.end_time ?? null,
          end_time: contractPeriod?.end_time ?? null,
        })),
      ];
      const activePeriod = findCurrentActivePeriod(rentalPeriods);
      const displayPeriods = buildVehicleDisplayPeriods(
        vehiclesData,
        rentalPeriods,
        activePeriod,
      );
      const combined = vehiclesData.map((vehicle, index) => ({
        ...vehicle,
        display_started_at: displayPeriods[index].display_started_at,
        display_ended_at: displayPeriods[index].display_ended_at,
        display_daily_rate:
          vehicle.daily_rate === null ? null : Number(vehicle.daily_rate),
        car: carMap.get(vehicle.car_id) || null,
      }));

      setHistory(combined);
      setRentalPeriods(rentalPeriods);
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
      fetchHistory();
    }
  }, [open, contractId, fetchHistory]);

  const periodGroups = useMemo<PeriodGroup[]>(() => {
    const groups = rentalPeriods.map((period) => ({ period, nodes: [] as TimelineNode[] }));

    history.forEach((vehicle) => {
      const vehicleStart = new Date(vehicle.display_started_at).getTime();
      const vehicleEnd = vehicle.display_ended_at
        ? new Date(vehicle.display_ended_at).getTime()
        : Number.POSITIVE_INFINITY;
      let previousMatchingPeriodIndex: number | null = null;

      groups.forEach((group, periodIndex) => {
        const periodStartTimestamp = getPeriodStartTimestamp(group.period);
        const periodEndTimestamp = getPeriodEndTimestamp(group.period);
        if (!periodStartTimestamp || !periodEndTimestamp) return;

        const periodStart = new Date(periodStartTimestamp).getTime();
        const periodEnd = new Date(periodEndTimestamp).getTime();
        if (vehicleStart > periodEnd || vehicleEnd < periodStart) return;

        const clippedStart = new Date(Math.max(vehicleStart, periodStart)).toISOString();
        const clippedEndMs = Math.min(vehicleEnd, periodEnd);
        const clippedEnd = Number.isFinite(clippedEndMs)
          ? new Date(clippedEndMs).toISOString()
          : null;

        group.nodes.push({
          ...vehicle,
          timeline_id: `${vehicle.id}-${group.period.id}-${periodIndex}`,
          display_started_at: clippedStart,
          display_ended_at: clippedEnd,
          continues_from_previous:
            previousMatchingPeriodIndex !== null &&
            previousMatchingPeriodIndex === periodIndex - 1,
        });
        previousMatchingPeriodIndex = periodIndex;
      });
    });

    groups.forEach((group) =>
      group.nodes.sort(
        (a, b) =>
          new Date(a.display_started_at).getTime() -
          new Date(b.display_started_at).getTime(),
      ),
    );
    return groups.filter((group) => group.nodes.length > 0);
  }, [history, rentalPeriods]);

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="flex h-full w-full flex-col border-l border-white/7 bg-[#11131b] p-4 font-dm-sans text-white sm:max-w-[440px] sm:p-6">
        <SheetHeader className="space-y-1.5 border-b border-white/7 pb-4 text-left">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-white/60" />
            <SheetTitle className="font-dm-sans text-lg font-semibold text-white">
              Vehicle Timeline
            </SheetTitle>
          </div>
          <SheetDescription className="font-dm-sans text-xs text-white/50">
            {loading
              ? "Loading..."
              : `${periodGroups.length} billing ${periodGroups.length === 1 ? "period" : "periods"}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 overflow-y-auto pr-1 [scrollbar-color:rgba(255,255,255,0.1)_transparent] [scrollbar-width:thin]">
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((item) => (
                <div key={item} className="h-40 rounded-xl border border-white/5 bg-white/[0.03]" />
              ))}
            </div>
          ) : periodGroups.length === 0 ? (
            <div className="py-12 text-center text-sm italic text-white/40">
              No vehicle history recorded
            </div>
          ) : (
            <div className="space-y-4">
              {periodGroups.map(({ period, nodes }, periodIndex) => {
                const periodTotal = nodes.reduce((sum, node) => {
                  const amount = calculateDisplayedAmount(
                    node.display_started_at,
                    node.display_ended_at,
                    node.display_daily_rate,
                  );
                  return sum + (amount ?? 0);
                }, 0);
                const periodStart = getPeriodStartTimestamp(period);
                const periodEnd = getPeriodEndTimestamp(period);

                return (
                  <section key={period.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#191c25]">
                    <header className="flex items-start justify-between gap-3 border-b border-white/7 p-4">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-white">
                          {periodIndex === 0 ? "Period 1" : `Extension ${periodIndex + 1}`}
                        </h2>
                        <p className="mt-1 font-ibm-plex-mono text-[10px] text-white/45">
                          {periodStart && periodEnd
                            ? `${formatDateTimeline(periodStart)} — ${formatDateTimeline(periodEnd)}`
                            : "Dates unavailable"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Total</div>
                        <div className="mt-0.5 font-ibm-plex-mono text-base font-semibold text-emerald-300">
                          {formatAed(periodTotal)}
                        </div>
                      </div>
                    </header>

                    <Accordion type="multiple" className="px-3 py-2">
                      {nodes.map((node, nodeIndex) => {
                        const days = calculateBillableDays(node.display_started_at, node.display_ended_at);
                        const amount = calculateDisplayedAmount(
                          node.display_started_at,
                          node.display_ended_at,
                          node.display_daily_rate,
                        );
                        const active = node.ended_at === null && nodeIndex === nodes.length - 1;
                        const vehicleName = node.car
                          ? `${node.car.make} ${node.car.model}`
                          : "Unknown Vehicle";

                        return (
                          <div key={node.timeline_id} className="relative pl-7">
                            {(nodeIndex > 0 || node.continues_from_previous) && (
                              <div className="absolute -top-2 left-[7px] flex h-4 items-center">
                                <span className={`h-4 border-l ${node.continues_from_previous ? "border-dashed border-sky-400/70" : "border-solid border-white/20"}`} />
                                {node.continues_from_previous && (
                                  <span className="ml-1.5 rounded bg-[#191c25] px-1 text-[8px] font-semibold uppercase tracking-wider text-sky-300">Continues</span>
                                )}
                              </div>
                            )}
                            {nodeIndex < nodes.length - 1 && (
                              <span className={`absolute bottom-0 left-[7px] top-4 border-l ${nodes[nodeIndex + 1].continues_from_previous ? "border-dashed border-sky-400/70" : "border-solid border-white/20"}`} />
                            )}
                            <span className={`absolute left-0 top-[23px] h-3.5 w-3.5 rounded-full border-2 border-[#191c25] ring-1 ${active ? "bg-emerald-400 ring-emerald-300/60" : "bg-white/50 ring-white/20"}`} />

                            <AccordionItem value={node.timeline_id} className="border-b border-white/7 last:border-b-0">
                              <AccordionTrigger className="min-h-16 py-3 text-left hover:no-underline [&>svg]:h-4 [&>svg]:w-4">
                                <div className="min-w-0 flex-1 pr-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-white/90">{vehicleName}</span>
                                    {node.car && <span className="shrink-0 font-ibm-plex-mono text-[10px] text-white/50">{node.car.plate}</span>}
                                    {active && <span className="shrink-0 rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-emerald-300">ACTIVE</span>}
                                  </div>
                                  <div className="mt-1 font-ibm-plex-mono text-[10px] text-white/45">
                                    {formatDateTimeline(node.display_started_at)} {active ? "→ Active" : `→ ${node.display_ended_at ? formatDateTimeline(node.display_ended_at) : "Active"}`}
                                  </div>
                                  <div className="mt-1 flex gap-3 font-ibm-plex-mono text-[11px] text-white/70">
                                    <span>{formatDays(days)} days</span>
                                    <span className="text-white/25">·</span>
                                    <span>{amount === null ? "--" : formatAed(amount)}</span>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pb-3">
                                <dl className="space-y-2 rounded-lg border border-white/7 bg-black/10 p-3">
                                  {[
                                    ["Vehicle", node.car ? `${vehicleName} · ${node.car.plate} · ${node.car.year}` : vehicleName],
                                    ["Start Date", formatDateTimeline(node.display_started_at)],
                                    ["End Date", active ? "Active" : node.display_ended_at ? formatDateTimeline(node.display_ended_at) : "Active"],
                                    ["Existing Price", node.display_daily_rate === null ? "--" : formatAed(node.display_daily_rate)],
                                    ["Existing Charged Days", formatDays(days)],
                                    ["Existing Total", amount === null ? "--" : formatAed(amount)],
                                  ].map(([label, value]) => (
                                    <div key={label} className="flex items-start justify-between gap-3">
                                      <dt className="text-[11px] text-white/40">{label}</dt>
                                      <dd className="text-right font-ibm-plex-mono text-xs text-white/85">{value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </AccordionContent>
                            </AccordionItem>
                          </div>
                        );
                      })}
                    </Accordion>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
