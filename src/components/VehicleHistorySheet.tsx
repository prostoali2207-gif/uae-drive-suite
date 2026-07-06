import React, { useCallback, useEffect, useState } from "react";
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

interface ReplacementEvent {
  id: string;
  replacement_at: string;
  before: CombinedVehicleHistory;
  after: CombinedVehicleHistory;
}

export const VehicleHistorySheet: React.FC<VehicleHistorySheetProps> = ({
  contractId,
  open,
  onClose,
}) => {
  const { toast } = useToast();
  const [history, setHistory] = useState<CombinedVehicleHistory[]>([]);
  const [replacementEvents, setReplacementEvents] = useState<ReplacementEvent[]>([]);
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

  const getEarliestTimestamp = (...timestamps: Array<string | null>) => {
    const validTimestamps = timestamps.filter(
      (timestamp): timestamp is string => Boolean(timestamp),
    );
    if (validTimestamps.length === 0) return null;

    return validTimestamps.reduce((earliest, timestamp) =>
      new Date(timestamp).getTime() < new Date(earliest).getTime()
        ? timestamp
        : earliest,
    );
  };

  const buildReplacementEvents = (
    vehicles: CombinedVehicleHistory[],
    rentalPeriods: RentalPeriod[],
  ): ReplacementEvent[] =>
    vehicles.flatMap((before, index) => {
      const after = vehicles[index + 1];
      const replacementAt = before.ended_at;
      if (!after || !replacementAt) return [];

      const currentPeriod = findMatchingPeriod(replacementAt, rentalPeriods);
      const periodStart = getPeriodStartTimestamp(currentPeriod);
      const periodEnd = getPeriodEndTimestamp(currentPeriod);
      const afterEnd = getEarliestTimestamp(after.ended_at, periodEnd);

      return [
        {
          id: `${before.id}-${after.id}`,
          replacement_at: replacementAt,
          before: {
            ...before,
            ...preventReversedRange(
              periodStart ?? before.display_started_at,
              replacementAt,
            ),
          },
          after: {
            ...after,
            ...preventReversedRange(replacementAt, afterEnd),
          },
        },
      ];
    });

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

  const grandTotal = history.reduce((sum, item) => {
    const displayedAmount = calculateDisplayedAmount(
      item.display_started_at,
      item.display_ended_at,
      item.display_daily_rate,
    );
    return sum + (displayedAmount ?? 0);
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
        setReplacementEvents([]);
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
      setReplacementEvents(buildReplacementEvents(combined, rentalPeriods));
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

  const renderVehicleDetails = (
    title: "Before Replacement" | "After Replacement",
    vehicle: CombinedVehicleHistory,
  ) => {
    const chargedDays = calculateBillableDays(
      vehicle.display_started_at,
      vehicle.display_ended_at,
    );
    const total = calculateDisplayedAmount(
      vehicle.display_started_at,
      vehicle.display_ended_at,
      vehicle.display_daily_rate,
    );
    const vehicleName = vehicle.car
      ? `${vehicle.car.make} ${vehicle.car.model}`
      : "Unknown Vehicle";
    const details = [
      {
        label: "Vehicle",
        value: vehicle.car
          ? `${vehicleName} · ${vehicle.car.plate} · ${vehicle.car.year}`
          : vehicleName,
      },
      { label: "Start Date", value: formatDateTimeline(vehicle.display_started_at) },
      {
        label: "End Date",
        value: vehicle.display_ended_at
          ? formatDateTimeline(vehicle.display_ended_at)
          : "Active",
      },
      {
        label: "Existing Price",
        value:
          vehicle.display_daily_rate === null
            ? "--"
            : formatAed(vehicle.display_daily_rate),
      },
      { label: "Existing Charged Days", value: formatDays(chargedDays) },
      { label: "Existing Total", value: total === null ? "--" : formatAed(total) },
    ];

    return (
      <section className="rounded-lg border border-white/7 bg-white/[0.025] p-3">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {title}
        </h3>
        <dl className="space-y-2.5">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="flex min-w-0 items-start justify-between gap-3"
            >
              <dt className="shrink-0 text-[11px] text-white/40">{detail.label}</dt>
              <dd className="min-w-0 text-right font-ibm-plex-mono text-xs text-white/85">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="flex h-full w-full flex-col border-l border-white/7 bg-[#161925] p-6 font-dm-sans text-white sm:max-w-[380px]">
        <SheetHeader className="space-y-1.5 border-b border-white/7 pb-4 text-left">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-white/60" />
            <SheetTitle className="font-dm-sans text-lg font-semibold text-white">
              Vehicle History
            </SheetTitle>
          </div>
          <SheetDescription className="font-dm-sans text-xs text-white/50">
            {loading
              ? "Loading..."
              : `${replacementEvents.length} ${
                  replacementEvents.length === 1 ? "replacement" : "replacements"
                }`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 overflow-y-auto pr-1 [scrollbar-color:rgba(255,255,255,0.1)_transparent] [scrollbar-width:thin]">
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/5 bg-[#1c1c1f] p-4"
                >
                  <div className="space-y-2">
                    <div className="h-3 w-1/3 rounded bg-white/10" />
                    <div className="h-4 w-4/5 rounded bg-white/10" />
                    <div className="h-3 w-1/2 rounded bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : replacementEvents.length === 0 ? (
            <div className="py-12 text-center text-sm italic text-white/40">
              No replacements recorded
            </div>
          ) : (
            <div>
              <Accordion
                type="multiple"
                className="space-y-3"
              >
                {replacementEvents.map((event, index) => {
                  const beforeName = event.before.car
                    ? `${event.before.car.make} ${event.before.car.model}`
                    : "Unknown Vehicle";
                  const afterName = event.after.car
                    ? `${event.after.car.make} ${event.after.car.model}`
                    : "Unknown Vehicle";

                  return (
                    <AccordionItem
                      key={event.id}
                      value={event.id}
                      className="overflow-hidden rounded-xl border border-white/7 bg-[#1c1c1f]"
                    >
                      <AccordionTrigger className="min-h-20 px-4 py-3 text-left hover:no-underline">
                        <div className="min-w-0 pr-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                            Replacement {index + 1}
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold text-white/90">
                            {beforeName} <span className="text-white/35">→</span>{" "}
                            {afterName}
                          </div>
                          <div className="mt-1 font-ibm-plex-mono text-[11px] font-normal text-white/50">
                            {formatDateTimeline(event.replacement_at)}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 border-t border-white/7 px-3 pt-3">
                        {renderVehicleDetails("Before Replacement", event.before)}
                        {renderVehicleDetails("After Replacement", event.after)}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              <div className="mt-4 border-t border-white/7 pt-4">
                <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 font-ibm-plex-mono">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Grand Total
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {formatAed(grandTotal)}
                  </span>
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
