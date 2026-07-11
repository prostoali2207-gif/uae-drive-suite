import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface InspectionRow {
  id: string;
  slot: string;
  photo_url: string | null;
}

interface ReplacementInspectionRow {
  id: string;
  type: "replacement_old_return" | "replacement_new_handover";
  slot: string;
  photo_url: string | null;
  uploaded_at: string | null;
}

interface ReplacementInspectionGroup {
  replacementId: string;
  oldReturn: string[];
  newHandover: string[];
  firstUploadedAt: string;
}

function getReplacementId(photoUrl: string): string | null {
  const replacementSegment = photoUrl.split("/").find((segment) => segment.startsWith("replacement-"));
  return replacementSegment ? replacementSegment.split("replacement-")[1] || null : null;
}

function PhotoGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground">
        <ImageIcon className="h-8 w-8" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {urls.map((url, index) => (
        <img
          key={`${url}-${index}`}
          src={url}
          alt="inspection"
          className="aspect-square w-full rounded-md border border-border object-cover"
        />
      ))}
    </div>
  );
}

const InspectionView = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const [pickupPhotos, setPickupPhotos] = useState<string[]>([]);
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
        .select("id, slot, photo_url")
        .eq("contract_id", contractId)
        .eq("type", "pickup")
        .order("uploaded_at", { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        setError("Could not load inspection photos.");
        setLoading(false);
        return;
      }

      const rows = ((data ?? []) as InspectionRow[]).filter((row) => row.photo_url);
      const urls: string[] = [];

      await Promise.all(
        rows.map(async (row) => {
          const photoUrl = row.photo_url;
          if (!photoUrl) return;

          if (/^(https?:|data:|blob:)/.test(photoUrl)) {
            urls.push(photoUrl);
            return;
          }

          const { data: publicUrlData } = supabase.storage
            .from("inspection-photos")
            .getPublicUrl(photoUrl);
          if (publicUrlData?.publicUrl) urls.push(publicUrlData.publicUrl);
        }),
      );

      if (!cancelled) {
        setPickupPhotos(urls);
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
        .select("id, type, slot, photo_url, uploaded_at")
        .eq("contract_id", contractId)
        .in("type", ["replacement_old_return", "replacement_new_handover"])
        .order("uploaded_at", { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        setReplacementError("Could not load replacement inspection photos.");
        setReplacementGroups([]);
        return;
      }

      const rows = ((data ?? []) as ReplacementInspectionRow[]).filter((row) => row.photo_url);
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
            oldReturn: [] as string[],
            newHandover: [] as string[],
            firstUploadedAt: row.uploaded_at ?? "",
          };
          if (row.type === "replacement_old_return") {
            group.oldReturn.push(resolvedUrl);
          } else {
            group.newHandover.push(resolvedUrl);
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

  const hasPickupPhotos = useMemo(() => pickupPhotos.length > 0, [pickupPhotos]);

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
            <section className="mb-6 overflow-hidden rounded-md border border-border bg-card">
              <div className="border-b border-border px-3 py-2 text-sm font-medium">
                Pickup Photos
              </div>
              <div className="p-3">
                {!hasPickupPhotos ? (
                  <div className="text-sm text-muted-foreground">No inspection photos uploaded yet.</div>
                ) : (
                  <PhotoGrid urls={pickupPhotos} />
                )}
              </div>
            </section>

            {(replacementError || replacementGroups.length > 0) && (
              <div className="space-y-5">
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
                        <PhotoGrid urls={group.oldReturn} />
                      </div>

                      <div>
                        <h3 className="mb-2 text-sm font-medium">Replacement Vehicle Handover Photos</h3>
                        <PhotoGrid urls={group.newHandover} />
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
