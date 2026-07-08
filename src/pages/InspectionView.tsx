import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface InspectionRow {
  slot: string;
  photo_url: string | null;
}

interface ReplacementInspectionRow extends InspectionRow {
  type: "replacement_old_return" | "replacement_new_handover";
  uploaded_at: string | null;
}

interface ReplacementInspectionGroup {
  replacementId: string;
  oldReturn: Record<string, string>;
  newHandover: Record<string, string>;
  firstUploadedAt: string;
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

function getReplacementId(photoUrl: string): string | null {
  const replacementSegment = photoUrl.split("/").find((segment) => segment.startsWith("replacement-"));
  return replacementSegment ? replacementSegment.split("replacement-")[1] || null : null;
}

const InspectionView = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [replacementGroups, setReplacementGroups] = useState<ReplacementInspectionGroup[]>([]);
  const [replacementError, setReplacementError] = useState("");
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

  useEffect(() => {
    let cancelled = false;

    const loadReplacementPhotos = async () => {
      if (!contractId) {
        setReplacementGroups([]);
        return;
      }

      setReplacementError("");

      const { data, error: fetchError } = await (supabase as any)
        .from("contract_inspections")
        .select("type, slot, photo_url, uploaded_at")
        .eq("contract_id", contractId)
        .in("type", ["replacement_old_return", "replacement_new_handover"])
        .order("uploaded_at", { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        setReplacementError("Could not load replacement inspection photos.");
        setReplacementGroups([]);
        return;
      }

      const rows = ((data ?? []) as ReplacementInspectionRow[]).filter(
        (row) => row.photo_url && PHOTO_SLOT_KEYS.has(row.slot),
      );
      const groups = new Map<string, ReplacementInspectionGroup>();

      await Promise.all(
        rows.map(async (row) => {
          const photoUrl = row.photo_url;
          if (!photoUrl) return;

          const replacementId = getReplacementId(photoUrl);
          if (!replacementId) return;

          let resolvedUrl = photoUrl;
          if (!/^(https?:|data:|blob:)/.test(photoUrl)) {
            const { data: publicUrlData } = supabase.storage
              .from("inspection-photos")
              .getPublicUrl(photoUrl);
            if (!publicUrlData?.publicUrl) return;
            resolvedUrl = publicUrlData.publicUrl;
          }

          const group = groups.get(replacementId) ?? {
            replacementId,
            oldReturn: {},
            newHandover: {},
            firstUploadedAt: row.uploaded_at ?? "",
          };
          const slotKey = PHOTO_SLOT_KEYS.get(row.slot) ?? row.slot;
          if (row.type === "replacement_old_return") {
            group.oldReturn[slotKey] = resolvedUrl;
          } else {
            group.newHandover[slotKey] = resolvedUrl;
          }
          if (!group.firstUploadedAt || (row.uploaded_at && row.uploaded_at < group.firstUploadedAt)) {
            group.firstUploadedAt = row.uploaded_at ?? "";
          }
          groups.set(replacementId, group);
        }),
      );

      if (!cancelled) {
        setReplacementGroups(
          Array.from(groups.values()).sort((a, b) => a.firstUploadedAt.localeCompare(b.firstUploadedAt)),
        );
      }
    };

    loadReplacementPhotos();

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

            {(replacementError || replacementGroups.length > 0) && (
              <div className="mt-6 space-y-5">
                {replacementError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-4 text-sm text-destructive">
                    {replacementError}
                  </div>
                )}

                {replacementGroups.map((group, index) => (
                  <section key={group.replacementId} className="rounded-md border border-border bg-card">
                    <div className="border-b border-border px-3 py-2">
                      <h2 className="text-base font-semibold">Replacement Inspection #{index + 1}</h2>
                    </div>

                    <div className="space-y-4 p-3">
                      <div>
                        <h3 className="mb-2 text-sm font-medium">Old Vehicle Return Photos</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {PHOTO_SLOTS.map((slot) => (
                            <section key={`${group.replacementId}-old-${slot.key}`} className="overflow-hidden rounded-md border border-border bg-background">
                              <div className="border-b border-border px-3 py-2 text-sm font-medium">
                                {slot.label}
                              </div>
                              {group.oldReturn[slot.key] ? (
                                <img
                                  src={group.oldReturn[slot.key]}
                                  alt={`${slot.label} old vehicle return`}
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
                      </div>

                      <div>
                        <h3 className="mb-2 text-sm font-medium">Replacement Vehicle Handover Photos</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {PHOTO_SLOTS.map((slot) => (
                            <section key={`${group.replacementId}-new-${slot.key}`} className="overflow-hidden rounded-md border border-border bg-background">
                              <div className="border-b border-border px-3 py-2 text-sm font-medium">
                                {slot.label}
                              </div>
                              {group.newHandover[slot.key] ? (
                                <img
                                  src={group.newHandover[slot.key]}
                                  alt={`${slot.label} replacement vehicle handover`}
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
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default InspectionView;
