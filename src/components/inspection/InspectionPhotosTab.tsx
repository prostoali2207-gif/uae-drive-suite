import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";
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

interface InspectionPhotosTabProps {
  contractId: string;
  uploadedBy?: string | null;
}

const MAX_PHOTOS = 10;

export function InspectionPhotosTab({ contractId, uploadedBy }: InspectionPhotosTabProps) {
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<InspectionType, boolean>>({ pickup: false, return: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cameraInputRefs = useRef<Record<InspectionType, HTMLInputElement | null>>({ pickup: null, return: null });
  const galleryInputRefs = useRef<Record<InspectionType, HTMLInputElement | null>>({ pickup: null, return: null });

  const photosByType = useMemo(() => {
    const map: Record<InspectionType, InspectionPhoto[]> = { pickup: [], return: [] };
    photos.forEach((photo) => {
      if (photo.type === "pickup" || photo.type === "return") {
        map[photo.type].push(photo);
      }
    });
    return map;
  }, [photos]);

  const refreshPhotos = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("contract_inspections")
      .select("id, contract_id, type, slot, photo_url, uploaded_at, uploaded_by")
      .eq("contract_id", contractId)
      .order("uploaded_at", { ascending: true });

    if (error) {
      setErrors((prev) => ({ ...prev, load: "Could not load inspection photos." }));
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
          if (!photo.photo_url) return;
          if (/^(https?:|data:|blob:)/.test(photo.photo_url)) {
            next[photo.id] = photo.photo_url;
            return;
          }
          const { data } = await supabase.storage
            .from("inspection-photos")
            .createSignedUrl(photo.photo_url, 60 * 10);
          if (data?.signedUrl) next[photo.id] = data.signedUrl;
        }),
      );
      if (!cancelled) setPreviewUrls(next);
    };

    loadPreviewUrls();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const uploadPhotos = async (type: InspectionType, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const currentCount = photosByType[type].length;
    const availableSlots = MAX_PHOTOS - currentCount;
    if (availableSlots <= 0) return;

    const filesToUpload = Array.from(files).slice(0, availableSlots);

    setUploading((prev) => ({ ...prev, [type]: true }));
    setErrors((prev) => ({ ...prev, [type]: "" }));

    for (const file of filesToUpload) {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${contractId}/${type}/${uniqueId}.jpg`;
      const uploadFile = await prepareImageForStorageUpload(file);
      logImageCompressionUpload("InspectionPhotosTab", file, uploadFile, path);

      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(path, uploadFile, {
          contentType: uploadFile.type || "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        setErrors((prev) => ({ ...prev, [type]: uploadError.message }));
        continue;
      }

      const payload = {
        contract_id: contractId,
        type,
        slot: uniqueId,
        photo_url: path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploadedBy ?? null,
      };

      const { error: saveError } = await (supabase as any).from("contract_inspections").insert(payload);
      if (saveError) {
        setErrors((prev) => ({ ...prev, [type]: saveError.message }));
      }
    }

    setUploading((prev) => ({ ...prev, [type]: false }));
    await refreshPhotos();
  };

  const deletePhoto = async (photo: InspectionPhoto) => {
    await supabase.storage.from("inspection-photos").remove([photo.photo_url]);
    await (supabase as any).from("contract_inspections").delete().eq("id", photo.id);
    await refreshPhotos();
  };

  const renderSection = (type: InspectionType, title: string) => {
    const list = photosByType[type];
    const count = list.length;
    const isUploading = uploading[type];
    const atLimit = count >= MAX_PHOTOS;

    return (
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <div className="p-3">
          {errors[type] && (
            <div className="mb-2 text-[11px] text-destructive">{errors[type]}</div>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {list.map((photo) => (
              <div key={photo.id} className="relative">
                {previewUrls[photo.id] ? (
                  <img
                    src={previewUrls[photo.id]}
                    alt="inspection"
                    className="h-24 w-full rounded-md border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => deletePhoto(photo)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <input
            ref={(node) => {
              cameraInputRefs.current[type] = node;
            }}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              uploadPhotos(type, event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={(node) => {
              galleryInputRefs.current[type] = node;
            }}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              uploadPhotos(type, event.target.files);
              event.target.value = "";
            }}
          />

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 flex-1 gap-1.5 text-xs sm:min-h-9"
              disabled={isUploading || atLimit}
              onClick={() => cameraInputRefs.current[type]?.click()}
            >
              {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              Take Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 flex-1 gap-1.5 text-xs sm:min-h-9"
              disabled={isUploading || atLimit}
              onClick={() => galleryInputRefs.current[type]?.click()}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Choose from Gallery
            </Button>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {atLimit ? "Limit reached — " : ""}{count}/{MAX_PHOTOS} photos
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className={cn("grid gap-3", errors.load && "pb-1")}>
      {errors.load && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors.load}
        </div>
      )}
      {renderSection("pickup", "Pickup Photos")}
      {renderSection("return", "Return Photos")}
    </div>
  );
}
