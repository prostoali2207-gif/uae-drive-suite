import React, { useEffect, useState } from "react";
import { CalendarDays, Gauge, Loader2, Wrench } from "lucide-react";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

interface ExtendedDatabase extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      car_maintenance: {
        Row: {
          id: string;
          car_id: string;
          owner_id: string;
          last_service_date: string | null;
          next_service_date: string | null;
          current_mileage: number | null;
          oil_change_date: string | null;
          oil_change_mileage: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          car_id: string;
          owner_id: string;
          last_service_date?: string | null;
          next_service_date?: string | null;
          current_mileage?: number | null;
          oil_change_date?: string | null;
          oil_change_mileage?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          car_id?: string;
          owner_id?: string;
          last_service_date?: string | null;
          next_service_date?: string | null;
          current_mileage?: number | null;
          oil_change_date?: string | null;
          oil_change_mileage?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
  };
}

type MaintenanceRecord = ExtendedDatabase["public"]["Tables"]["car_maintenance"]["Row"];
type MaintenanceInsert = ExtendedDatabase["public"]["Tables"]["car_maintenance"]["Insert"];

interface MaintenancePanelProps {
  carId: string;
  open: boolean;
  onClose: () => void;
}

const maintenanceDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;

const formatDate = (date: string | null) => {
  if (!date) return "Not set";

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatMileage = (mileage: number | null) => {
  if (mileage === null || mileage === undefined) return "Not set";
  return `${Number(mileage).toLocaleString()} km`;
};

const formatRecordedMileage = (mileage: number | null) => {
  if (mileage === null || mileage === undefined) return "Not recorded";
  return `${Number(mileage).toLocaleString()} km`;
};

const formatHistoryDate = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const MaintenancePanel: React.FC<MaintenancePanelProps> = ({
  carId,
  open,
  onClose,
}) => {
  const [latestRecord, setLatestRecord] = useState<MaintenanceRecord | null>(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastServiceDate, setLastServiceDate] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");
  const [currentMileage, setCurrentMileage] = useState("");
  const [oilChangeDate, setOilChangeDate] = useState("");
  const [oilChangeMileage, setOilChangeMileage] = useState("");
  const [notes, setNotes] = useState("");
  const [showEditForm, setShowEditForm] = useState(false);

  const drivenSinceOilChange =
    latestRecord?.current_mileage !== null &&
    latestRecord?.current_mileage !== undefined &&
    latestRecord?.oil_change_mileage !== null &&
    latestRecord?.oil_change_mileage !== undefined
      ? latestRecord.current_mileage - latestRecord.oil_change_mileage
      : null;

  const oilChangeDistanceClass =
    drivenSinceOilChange !== null && drivenSinceOilChange > 10_000
      ? "text-red-400"
      : drivenSinceOilChange !== null && drivenSinceOilChange > 8_000
        ? "text-amber-400"
        : "text-white";

  const shouldShowDrivenSinceOilChange =
    latestRecord?.current_mileage !== null &&
    latestRecord?.current_mileage !== undefined &&
    latestRecord.current_mileage > 0 &&
    drivenSinceOilChange !== null &&
    drivenSinceOilChange > 0;

  const oilChangeHistory = maintenanceHistory.filter(
    (record) => record.oil_change_mileage !== null && record.oil_change_mileage !== undefined,
  );

  const fetchLatestMaintenance = async () => {
    if (!carId) return;

    setLoading(true);
    try {
      const { data, error } = await maintenanceDb
        .from("car_maintenance")
        .select("*")
        .eq("car_id", carId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setLatestRecord(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to load maintenance record:", err);
      toast.error(`Failed to load maintenance details: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchMaintenanceHistory = async () => {
    if (!carId) return;

    try {
      const { data, error } = await maintenanceDb
        .from("car_maintenance")
        .select("*")
        .eq("car_id", carId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setMaintenanceHistory(data ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to load maintenance history:", err);
      toast.error(`Failed to load mileage history: ${message}`);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLatestMaintenance();
      fetchMaintenanceHistory();
    }
  }, [open, carId]);

  const resetForm = () => {
    setLastServiceDate("");
    setNextServiceDate("");
    setCurrentMileage("");
    setOilChangeDate("");
    setOilChangeMileage("");
    setNotes("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("You must be signed in to save maintenance details.");

      const payload: MaintenanceInsert = {
        car_id: carId,
        owner_id: user.id,
      };

      if (lastServiceDate) payload.last_service_date = lastServiceDate;
      if (nextServiceDate) payload.next_service_date = nextServiceDate;
      if (currentMileage) payload.current_mileage = Number(currentMileage);
      if (oilChangeDate) payload.oil_change_date = oilChangeDate;
      if (oilChangeMileage) payload.oil_change_mileage = Number(oilChangeMileage);
      if (notes.trim()) payload.notes = notes.trim();

      const { error } = await maintenanceDb.from("car_maintenance").upsert(payload);

      if (error) throw error;

      toast.success("Maintenance details saved");
      resetForm();
      await fetchLatestMaintenance();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to save maintenance record:", err);
      toast.error(`Failed to save maintenance details: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="w-full sm:max-w-[420px] bg-zinc-800/50 border-l border-zinc-700 text-white p-6 flex h-full flex-col font-dm-sans">
        <SheetHeader className="space-y-1.5 text-left border-b border-zinc-700 pb-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-zinc-400" />
            <SheetTitle className="font-dm-sans text-lg font-semibold text-white">
              Maintenance
            </SheetTitle>
          </div>
          <SheetDescription className="font-dm-sans text-xs text-zinc-400">
            Latest service snapshot and new maintenance entry.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pt-6 pr-1 [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin]">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900 text-zinc-400">
              <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-black">
                Overview
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:text-black">
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-5 space-y-5">
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-20 rounded-lg bg-zinc-900" />
                  <div className="h-20 rounded-lg bg-zinc-900" />
                  <div className="h-24 rounded-lg bg-zinc-900" />
                </div>
              ) : (
                <div className="space-y-4">
                  <section className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                      <div className="mb-2 flex items-center gap-2 text-zinc-400">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide">
                          Last service
                        </span>
                      </div>
                      <p className="font-dm-sans text-sm font-medium text-white">
                        {formatDate(latestRecord?.last_service_date ?? null)}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                      <div className="mb-2 flex items-center gap-2 text-zinc-400">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide">
                          Next service
                        </span>
                      </div>
                      <p className="font-dm-sans text-sm font-medium text-white">
                        {formatDate(latestRecord?.next_service_date ?? null)}
                      </p>
                    </div>
                  </section>

                  <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <div className="mb-2 flex items-center gap-2 text-zinc-400">
                      <Gauge className="h-3.5 w-3.5" />
                      <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide">
                        Current mileage
                      </span>
                    </div>
                    <p className="font-ibm-plex-mono text-xl font-semibold text-white">
                      {formatMileage(latestRecord?.current_mileage ?? null)}
                    </p>
                  </section>

                  <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      Notes
                    </span>
                    <p className="mt-2 min-h-10 whitespace-pre-wrap font-dm-sans text-sm leading-5 text-zinc-400">
                      {latestRecord?.notes || "No notes recorded."}
                    </p>
                  </section>

                  <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      Oil Change
                    </span>
                    <div className="mt-2 space-y-1">
                      <p className="font-dm-sans text-sm font-medium text-white">
                        {latestRecord?.oil_change_date
                          ? formatHistoryDate(latestRecord.oil_change_date)
                          : "Not recorded"}
                      </p>
                      <p className="font-ibm-plex-mono text-sm font-semibold text-white">
                        {formatRecordedMileage(latestRecord?.oil_change_mileage ?? null)}
                      </p>
                    </div>
                    {shouldShowDrivenSinceOilChange && (
                      <p className={`mt-3 font-dm-sans text-xs font-medium ${oilChangeDistanceClass}`}>
                        Driven since last oil change: {Number(drivenSinceOilChange).toLocaleString()} km
                      </p>
                    )}
                  </section>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white"
                    onClick={() => setShowEditForm((current) => !current)}
                  >
                    Edit
                  </Button>
                </div>
              )}

              {showEditForm && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label
                      htmlFor="maintenance-last-service"
                      className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                    >
                      Last service date
                    </Label>
                    <Input
                      id="maintenance-last-service"
                      type="date"
                      value={lastServiceDate}
                      onChange={(event) => setLastServiceDate(event.target.value)}
                      className="border-zinc-700 bg-zinc-900 font-dm-sans text-white [color-scheme:dark] placeholder:text-zinc-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="maintenance-next-service"
                      className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                    >
                      Next service date
                    </Label>
                    <Input
                      id="maintenance-next-service"
                      type="date"
                      value={nextServiceDate}
                      onChange={(event) => setNextServiceDate(event.target.value)}
                      className="border-zinc-700 bg-zinc-900 font-dm-sans text-white [color-scheme:dark] placeholder:text-zinc-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="maintenance-mileage"
                    className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                  >
                    Current mileage (km)
                  </Label>
                  <Input
                    id="maintenance-mileage"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={currentMileage}
                    onChange={(event) => setCurrentMileage(event.target.value)}
                    placeholder="0"
                    className="border-zinc-700 bg-zinc-900 font-ibm-plex-mono text-white placeholder:text-zinc-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label
                      htmlFor="maintenance-oil-change-date"
                      className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                    >
                      Oil Change Date
                    </Label>
                    <Input
                      id="maintenance-oil-change-date"
                      type="date"
                      value={oilChangeDate}
                      onChange={(event) => setOilChangeDate(event.target.value)}
                      className="border-zinc-700 bg-zinc-900 font-dm-sans text-white [color-scheme:dark] placeholder:text-zinc-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="maintenance-oil-change-mileage"
                      className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                    >
                      Mileage at Oil Change (KM)
                    </Label>
                    <Input
                      id="maintenance-oil-change-mileage"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={oilChangeMileage}
                      onChange={(event) => setOilChangeMileage(event.target.value)}
                      placeholder="0"
                      className="border-zinc-700 bg-zinc-900 font-ibm-plex-mono text-white placeholder:text-zinc-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="maintenance-notes"
                    className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
                  >
                    Notes
                  </Label>
                  <Textarea
                    id="maintenance-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional maintenance notes"
                    className="min-h-24 resize-none border-zinc-700 bg-zinc-900 font-dm-sans text-white placeholder:text-zinc-400"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={saving || !carId}
                  className="w-full bg-white text-black hover:bg-zinc-200"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Save maintenance"
                  )}
                </Button>
              </form>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-5">
              <section>
                <h3 className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Oil Change History
                </h3>

                {oilChangeHistory.length === 0 ? (
                  <p className="mt-3 font-dm-sans text-sm text-zinc-400">No oil changes recorded</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {oilChangeHistory.map((record) => (
                      <div key={record.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-dm-sans text-sm text-white">
                            {record.oil_change_date ? formatHistoryDate(record.oil_change_date) : formatHistoryDate(record.created_at)}
                          </span>
                          <span className="font-ibm-plex-mono text-sm font-semibold text-white">
                            {formatRecordedMileage(record.oil_change_mileage)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};
