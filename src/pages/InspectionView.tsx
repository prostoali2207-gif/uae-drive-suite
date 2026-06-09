import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface InspectionRow {
  slot: string;
  photo_url: string | null;
}

const PHOTO_SLOTS = [
  { key: "front", label: "Front", legacySlots: ["Front"] },
  { key: "rear", label: "Rear", legacySlots: ["Rear"] },
  { key: "left_side", label: "Left side", legacySlots: ["Left side"] },
  { key: "right_side", label: "Right side", legacySlots: ["Right side"] },
  { key: "dashboard", label: "Dashboard", legacySlots: ["Dashboard / odometer"] },
  { key: "odometer", label: "Odometer", legacySlots: [] },
  { key: "interior_front", label: "Interior front", legacySlots: [] },
  { key: "interior_rear", label: "Interior rear", legacySlots: [] },
];

const PHOTO_SLOT_KEYS = new Map(
  PHOTO_SLOTS.flatMap((slot) => [
    [slot.key, slot.key],
    ...slot.legacySlots.map((legacySlot) => [legacySlot, slot.key] as const),
  ]),
);

const InspectionView = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadPhotos = async () => {
      if (!contractId) {
        setLoading(false);
        setError("Missing contract ID.");
        return;
      }

      setLoading(true);
      setError("");

      const { data, error: fetchError } = await (supabase as any)
        .from("contract_inspections")
        .select("slot, photo_url")
        .eq("contract_id", contractId)
        .eq("type", "pickup");

      if (cancelled) return;

      if (fetchError) {
        setError("Could not load inspection photos.");
        setLoading(false);
        return;
      }

      const rows = ((data ?? []) as InspectionRow[]).filter(
        (row) => row.photo_url && PHOTO_SLOT_KEYS.has(row.slot),
      );
      const nextPhotos: Record<string, string> = {};

      await Promise.all(
        rows.map(async (row) => {
          const photoUrl = row.photo_url;
          if (!photoUrl) return;

          if (/^(https?:|data:|blob:)/.test(photoUrl)) {
            nextPhotos[PHOTO_SLOT_KEYS.get(row.slot) ?? row.slot] = photoUrl;
            return;
          }

          const { data: publicUrlData } = supabase.storage
            .from("inspection-photos")
            .getPublicUrl(photoUrl);
          if (publicUrlData?.publicUrl) nextPhotos[PHOTO_SLOT_KEYS.get(row.slot) ?? row.slot] = publicUrlData.publicUrl;
        }),
      );

      if (!cancelled) {
        setPhotos(nextPhotos);
        setLoading(false);
      }
    };

    loadPhotos();

    return () => {
      cancelled = true;
    };
  }, [contractId]);

  const hasPhotos = useMemo(() => Object.keys(photos).length > 0, [photos]);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5">
          <h1 className="text-xl font-semibold">Vehicle Inspection Photos</h1>
          <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {contractId ?? "-"}
          </div>
        </header>

        {loading ? (
          <div className="rounded-md border border-border bg-card px-3 py-4 text-sm text-muted-foreground">
            Loading inspection photos...
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-4 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <>
            {!hasPhotos && (
              <div className="mb-4 rounded-md border border-border bg-card px-3 py-4 text-sm text-muted-foreground">
                No inspection photos uploaded yet.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {PHOTO_SLOTS.map((slot) => (
                <section key={slot.key} className="overflow-hidden rounded-md border border-border bg-card">
                  <div className="border-b border-border px-3 py-2 text-sm font-medium">
                    {slot.label}
                  </div>
                  {photos[slot.key] ? (
                    <img
                      src={photos[slot.key]}
                      alt={`${slot.label} inspection`}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-muted/30 text-muted-foreground">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default InspectionView;
