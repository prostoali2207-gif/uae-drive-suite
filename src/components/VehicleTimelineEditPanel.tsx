import React, { useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TimelineVehicle {
  id: string;
  contract_id: string;
  car_id: string;
  started_at: string;
  ended_at: string | null;
  owner_id: string;
  created_at: string;
  daily_rate: number | null;
}

interface VehicleTimelineEditPanelProps {
  node: TimelineVehicle;
  contractId: string;
  isFirstVehicle: boolean;
  isActive: boolean;
  onSaved: () => Promise<void> | void;
}

const toDubaiInputValue = (dateStr: string | null) => {
  if (!dateStr) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(dateStr));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
};

const fromDubaiInputValue = (value: string) =>
  new Date(`${value}:00+04:00`).toISOString();

export const VehicleTimelineEditPanel: React.FC<VehicleTimelineEditPanelProps> = ({
  node,
  contractId,
  isFirstVehicle,
  isActive,
  onSaved,
}) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [rateValue, setRateValue] = useState("");
  const [saving, setSaving] = useState(false);

  const beginEdit = () => {
    setStartValue(toDubaiInputValue(node.started_at));
    setEndValue(toDubaiInputValue(node.ended_at));
    setRateValue(node.daily_rate === null ? "" : String(Number(node.daily_rate)));
    setEditing(true);
  };

  const saveCorrection = async () => {
    if (!startValue || (!isActive && !endValue)) {
      toast({
        title: "Missing date",
        description: "Enter the replacement date and time.",
        variant: "destructive",
      });
      return;
    }

    const rate = Number(rateValue);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast({
        title: "Invalid price",
        description: "Daily price must be greater than zero.",
        variant: "destructive",
      });
      return;
    }

    const start = isFirstVehicle ? node.started_at : fromDubaiInputValue(startValue);
    const end = isActive ? null : fromDubaiInputValue(endValue);
    if (end && new Date(start).getTime() >= new Date(end).getTime()) {
      toast({
        title: "Invalid dates",
        description: "End date must be later than start date.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data: segments, error: segmentsError } = await supabase
        .from("contract_vehicles")
        .select("id, contract_id, car_id, started_at, ended_at, owner_id, created_at, daily_rate")
        .eq("contract_id", contractId)
        .order("started_at", { ascending: true });
      if (segmentsError) throw segmentsError;

      const ordered = (segments ?? []) as TimelineVehicle[];
      const index = ordered.findIndex((segment) => segment.id === node.id);
      if (index < 0) throw new Error("Vehicle segment was not found.");

      const previous = index > 0 ? ordered[index - 1] : null;
      const next = index < ordered.length - 1 ? ordered[index + 1] : null;

      if (previous && new Date(start).getTime() <= new Date(previous.started_at).getTime()) {
        toast({
          title: "Invalid dates",
          description: "This replacement must be later than the previous vehicle start.",
          variant: "destructive",
        });
        return;
      }
      if (next && end && next.ended_at && new Date(end).getTime() >= new Date(next.ended_at).getTime()) {
        toast({
          title: "Invalid dates",
          description: "This vehicle must end before the next vehicle ends.",
          variant: "destructive",
        });
        return;
      }

      const effectiveEnd = end ?? "9999-12-31T23:59:59.999Z";
      const { data: conflict, error: conflictError } = await supabase
        .from("contract_vehicles")
        .select("id")
        .eq("car_id", node.car_id)
        .neq("contract_id", contractId)
        .lt("started_at", effectiveEnd)
        .or(`ended_at.is.null,ended_at.gt.${start}`)
        .limit(1);
      if (conflictError) throw conflictError;
      if (conflict?.length) {
        toast({
          title: "Vehicle is busy",
          description: "The corrected dates overlap another contract for this vehicle.",
          variant: "destructive",
        });
        return;
      }

      const updates: TimelineVehicle[] = [
        {
          ...ordered[index],
          started_at: start,
          ended_at: end,
          daily_rate: rate,
        },
      ];
      if (previous) updates.push({ ...previous, ended_at: start });
      if (next && end) updates.push({ ...next, started_at: end });

      const { error: updateError } = await supabase
        .from("contract_vehicles")
        .upsert(updates, { onConflict: "id" });
      if (updateError) throw updateError;

      await onSaved();
      setEditing(false);
      toast({
        title: "History corrected",
        description: "Vehicle dates and price were updated.",
      });
    } catch (error: unknown) {
      toast({
        title: "Could not save",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={beginEdit}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/80 transition hover:bg-white/[0.08]"
      >
        <Pencil className="h-4 w-4" />
        Edit vehicle history
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t border-white/7 pt-3">
      <div>
        <label className="mb-1 block text-[11px] text-white/45">Start date and time</label>
        <input
          type="datetime-local"
          value={startValue}
          onChange={(event) => setStartValue(event.target.value)}
          disabled={isFirstVehicle || saving}
          className="min-h-11 w-full rounded-md border border-white/10 bg-[#11131b] px-3 font-ibm-plex-mono text-xs text-white outline-none focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-45"
        />
        {isFirstVehicle && (
          <p className="mt-1 text-[10px] text-white/35">
            The first vehicle starts with the contract and is changed in contract details.
          </p>
        )}
      </div>

      {!isActive && (
        <div>
          <label className="mb-1 block text-[11px] text-white/45">End date and time</label>
          <input
            type="datetime-local"
            value={endValue}
            onChange={(event) => setEndValue(event.target.value)}
            disabled={saving}
            className="min-h-11 w-full rounded-md border border-white/10 bg-[#11131b] px-3 font-ibm-plex-mono text-xs text-white outline-none focus:border-white/25"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] text-white/45">Daily price, AED</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={rateValue}
          onChange={(event) => setRateValue(event.target.value)}
          disabled={saving}
          className="min-h-11 w-full rounded-md border border-white/10 bg-[#11131b] px-3 font-ibm-plex-mono text-xs text-white outline-none focus:border-white/25"
        />
      </div>

      <p className="text-[10px] leading-relaxed text-amber-200/65">
        Changing a boundary also moves the adjacent vehicle boundary so the timeline stays continuous.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-xs font-semibold text-white/65 hover:bg-white/[0.05] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
        <button
          type="button"
          onClick={saveCorrection}
          disabled={saving}
          className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-400 px-3 text-xs font-bold text-[#0d1512] hover:bg-emerald-300 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save correction
        </button>
      </div>
    </div>
  );
};
