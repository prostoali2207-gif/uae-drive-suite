import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type InspectionType = "pickup" | "return";

interface InspectionPhoto {
  id: string;
  contract_id: string;
  type: InspectionType;
  slot: string;
  photo_url: string;
  uploaded_at: string | null;
  uploaded_by: string | null;
}

interface SlotState {
  uploading: boolean;
  error: string;
}

interface InspectionPhotosTabProps {
  contractId: string;
  uploadedBy?: string | null;
}

const MAIN_SLOTS = ["Front", "Rear", "Left side", "Right side", "Dashboard / odometer"];
const DAMAGE_SLOTS = ["Damage 1", "Damage 2", "Damage 3"];
const SLOTS = [...MAIN_SLOTS, ...DAMAGE_SLOTS];

function slotKey(slot: string): string {
  return slot.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stateKey(type: InspectionType, slot: string): string {
  return `${type}:${slot}`;
}

export function InspectionPhotosTab({ contractId, uploadedBy }: InspectionPhotosTabProps) {
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const photoByTypeSlot = useMemo(() => {
    const map = new Map<string, InspectionPhoto>();
    photos.forEach((photo) => map.set(stateKey(photo.type, photo.slot), photo));
    return map;
  }, [photos]);

  const setSlotState = (type: InspectionType, slot: string, state: Partial<SlotState>) => {
    const key = stateKey(type, slot);
    setSlotStates((prev) => ({
      ...prev,
      [key]: {
        uploading: false,
        error: "",
        ...prev[key],
        ...state,
      },
    }));
  };

  const refreshPhotos = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("contract_inspections")
      .select("id, contract_id, type, slot, photo_url, uploaded_at, uploaded_by")
      .eq("contract_id", contractId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      setSlotStates((prev) => ({
        ...prev,
        load: { uploading: false, error: "Could not load inspection photos." },
      }));
      return;
    }

    setPhotos((data ?? []) as InspectionPhoto[]);
  }, [contractId]);

  useEffect(() => {
    refreshPhotos();
  }, [refreshPhotos]);

  useEffect(() => {
    let cancelled = false;

    const loadPreviewUrls = async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        photos.map(async (photo) => {
          const key = stateKey(photo.type, photo.slot);
          if (!photo.photo_url) return;
          if (/^(https?:|data:|blob:)/.test(photo.photo_url)) {
            next[key] = photo.photo_url;
            return;
          }

          const { data } = await supabase.storage
            .from("inspection-photos")
            .createSignedUrl(photo.photo_url, 60 * 10);
          if (data?.signedUrl) next[key] = data.signedUrl;
        }),
      );

      if (!cancelled) setPreviewUrls(next);
    };

    loadPreviewUrls();

    return () => {
      cancelled = true;
    };
  }, [photos]);

  const uploadPhoto = async (type: InspectionType, slot: string, file: File | undefined) => {
    if (!file) return;

    setSlotState(type, slot, { uploading: true, error: "" });
    const key = stateKey(type, slot);
    const path = `${contractId}/${type}/${slotKey(slot)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("inspection-photos")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      setSlotState(type, slot, { uploading: false, error: uploadError.message });
      return;
    }

    const existing = photoByTypeSlot.get(key);
    const payload = {
      contract_id: contractId,
      type,
      slot,
      photo_url: path,
      uploaded_at: new Date().toISOString(),
      uploaded_by: uploadedBy ?? null,
    };

    const { error: saveError } = existing
      ? await (supabase as any).from("contract_inspections").update(payload).eq("id", existing.id)
      : await (supabase as any).from("contract_inspections").insert(payload);

    if (saveError) {
      setSlotState(type, slot, { uploading: false, error: saveError.message });
      return;
    }

    setSlotState(type, slot, { uploading: false, error: "" });
    await refreshPhotos();
  };

  const renderSlot = (type: InspectionType, slot: string) => {
    const key = stateKey(type, slot);
    const photo = photoByTypeSlot.get(key);
    const previewUrl = previewUrls[key];
    const slotState = slotStates[key] ?? { uploading: false, error: "" };
    const isDamage = slot.startsWith("Damage");

    return (
      <div key={slot} className="grid gap-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[150px,1fr,150px] sm:items-center">
        <div>
          <div className="text-sm font-medium text-foreground">{slot}</div>
          {isDamage && <div className="text-[11px] text-muted-foreground">Optional</div>}
        </div>

        <div className="min-w-0">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`${slot} inspection`}
              className="h-20 w-28 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex h-20 w-28 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
          {photo?.uploaded_at && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Uploaded {new Date(photo.uploaded_at).toLocaleString("en-GB")}
            </div>
          )}
          {slotState.error && (
            <div className="mt-1 text-[11px] text-destructive">{slotState.error}</div>
          )}
        </div>

        <div className="flex justify-start sm:justify-end">
          <input
            ref={(node) => {
              inputRefs.current[key] = node;
            }}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              uploadPhoto(type, slot, event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 gap-1.5 text-xs sm:min-h-9"
            disabled={slotState.uploading}
            onClick={() => inputRefs.current[key]?.click()}
          >
            {slotState.uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {slotState.uploading ? "Uploading..." : photo ? "Replace Photo" : "Take Photo"}
          </Button>
        </div>
      </div>
    );
  };

  const renderSection = (type: InspectionType, title: string) => (
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="px-3">
        {SLOTS.map((slot) => renderSlot(type, slot))}
      </div>
    </section>
  );

  return (
    <div className={cn("grid gap-3", slotStates.load?.error && "pb-1")}>
      {slotStates.load?.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {slotStates.load.error}
        </div>
      )}
      {renderSection("pickup", "Pickup Photos")}
      {renderSection("return", "Return Photos")}
    </div>
  );
}
