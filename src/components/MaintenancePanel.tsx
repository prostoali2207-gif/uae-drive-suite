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

export const MaintenancePanel: React.FC<MaintenancePanelProps> = ({
  carId,
  open,
  onClose,
}) => {
  const [latestRecord, setLatestRecord] = useState<MaintenanceRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastServiceDate, setLastServiceDate] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");
  const [currentMileage, setCurrentMileage] = useState("");
  const [notes, setNotes] = useState("");

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

  useEffect(() => {
    if (open) {
      fetchLatestMaintenance();
    }
  }, [open, carId]);

  const resetForm = () => {
    setLastServiceDate("");
    setNextServiceDate("");
    setCurrentMileage("");
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
      <SheetContent className="w-full sm:max-w-[420px] bg-[#111520] border-l border-white/10 text-white p-6 flex h-full flex-col font-dm-sans">
        <SheetHeader className="space-y-1.5 text-left border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-cyan-300/80" />
            <SheetTitle className="font-dm-sans text-lg font-semibold text-white">
              Maintenance
            </SheetTitle>
          </div>
          <SheetDescription className="font-dm-sans text-xs text-white/50">
            Latest service snapshot and new maintenance entry.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pt-6 pr-1 [scrollbar-color:rgba(255,255,255,0.16)_transparent] [scrollbar-width:thin]">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-20 rounded-md bg-white/[0.06]" />
              <div className="h-20 rounded-md bg-white/[0.06]" />
              <div className="h-24 rounded-md bg-white/[0.06]" />
            </div>
          ) : (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center gap-2 text-white/45">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide">
                      Last service
                    </span>
                  </div>
                  <p className="font-dm-sans text-sm font-medium text-white/90">
                    {formatDate(latestRecord?.last_service_date ?? null)}
                  </p>
                </div>

                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center gap-2 text-white/45">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide">
                      Next service
                    </span>
                  </div>
                  <p className="font-dm-sans text-sm font-medium text-white/90">
                    {formatDate(latestRecord?.next_service_date ?? null)}
                  </p>
                </div>
              </section>

              <section className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 flex items-center gap-2 text-white/45">
                  <Gauge className="h-3.5 w-3.5" />
                  <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide">
                    Current mileage
                  </span>
                </div>
                <p className="font-ibm-plex-mono text-xl font-semibold text-white">
                  {formatMileage(latestRecord?.current_mileage ?? null)}
                </p>
              </section>

              <section className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <span className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-white/45">
                  Notes
                </span>
                <p className="mt-2 min-h-10 whitespace-pre-wrap font-dm-sans text-sm leading-5 text-white/75">
                  {latestRecord?.notes || "No notes recorded."}
                </p>
              </section>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4 border-t border-white/10 pt-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label
                  htmlFor="maintenance-last-service"
                  className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-white/50"
                >
                  Last service date
                </Label>
                <Input
                  id="maintenance-last-service"
                  type="date"
                  value={lastServiceDate}
                  onChange={(event) => setLastServiceDate(event.target.value)}
                  className="border-white/10 bg-white/[0.04] font-dm-sans text-white [color-scheme:dark] placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="maintenance-next-service"
                  className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-white/50"
                >
                  Next service date
                </Label>
                <Input
                  id="maintenance-next-service"
                  type="date"
                  value={nextServiceDate}
                  onChange={(event) => setNextServiceDate(event.target.value)}
                  className="border-white/10 bg-white/[0.04] font-dm-sans text-white [color-scheme:dark] placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="maintenance-mileage"
                className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-white/50"
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
                className="border-white/10 bg-white/[0.04] font-ibm-plex-mono text-white placeholder:text-white/30"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="maintenance-notes"
                className="font-dm-sans text-[10px] font-semibold uppercase tracking-wide text-white/50"
              >
                Notes
              </Label>
              <Textarea
                id="maintenance-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional maintenance notes"
                className="min-h-24 resize-none border-white/10 bg-white/[0.04] font-dm-sans text-white placeholder:text-white/30"
              />
            </div>

            <Button
              type="submit"
              disabled={saving || !carId}
              className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
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
        </div>
      </SheetContent>
    </Sheet>
  );
};
