import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";

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

interface UploadState {
  uploading: boolean;
  error: string;
}

interface InspectionPhotosTabProps {
  contractId: string;
  uploadedBy?: string | null;
}

const MAX_PHOTOS_PER_SECTION = 10;

function stateKey(type: InspectionType, id: string): string {
  return `${type}:${id}`;
}

function uniquePhotoPath(contractId: string, type: InspectionType, file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${contractId}/${type}/${Date.now()}-${suffix}.${extension}`;
}

export function InspectionPhotosTab({ contractId, uploadedBy }: InspectionPhotosTabProps) {
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, UploadState>>({});
  const inputRefs = useRef<Record<InspectionType, HTMLInputElement | null>>({
    pickup: null,
    return: null,
  });

  const photosByType = useMemo(() => {
    const grouped: Record<InspectionType, InspectionPhoto[]> = { pickup: [], return: [] };
    photos.forEach((photo) => {
      grouped[photo.type].push(photo);
    });
    return grouped;
  }, [photos]);

  const setStateFor = (key: string, state: Partial<UploadState>) => {
    setStates((prev) => ({
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
      .in("type", ["pickup", "return"])
      .order("uploaded_at", { ascending: false });

    if (error) {
      setStateFor("load", { error: "Could not load inspection photos." });
      return;
    }

    setPhotos((data ?? []) as InspectionPhoto[]);
    setStateFor("load", { error: "" });
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

          const key = stateKey(photo.type, photo.id);
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

  const uploadPhotos = async (type: InspectionType, fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const uploadKey = stateKey(type, "upload");
    const currentCount = photosByType[type].length;
    const remaining = MAX_PHOTOS_PER_SECTION - currentCount;
    const filesToUpload = files.slice(0, Math.max(remaining, 0));

    if (!filesToUpload.length) {
      setStateFor(uploadKey, { error: "Limit reached" });
      return;
    }

    setStateFor(uploadKey, {
      uploading: true,
      error: files.length > filesToUpload.length ? "Only 10 photos can be saved per section." : "",
    });

    for (const file of filesToUpload) {
      const path = uniquePhotoPath(contractId, type, file);
      const uploadFile = await prepareImageForStorageUpload(file);
      logImageCompressionUpload("InspectionPhotosTab", file, uploadFile, path);

      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(path, uploadFile, {
          contentType: uploadFile.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        setStateFor(uploadKey, { uploading: false, error: uploadError.message });
        return;
      }

      const { error: saveError } = await (supabase as any).from("contract_inspections").insert({
        contract_id: contractId,
        type,
        slot: "photo",
        photo_url: path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploadedBy ?? null,
      });

      if (saveError) {
        setStateFor(uploadKey, { uploading: false, error: saveError.message });
        return;
      }
    }

    setStateFor(uploadKey, {
      uploading: false,
      error: files.length > filesToUpload.length ? "Only 10 photos can be saved per section." : "",
    });
    await refreshPhotos();
  };

  const deletePhoto = async (photo: InspectionPhoto) => {
    const key = stateKey(photo.type, photo.id);
    setStateFor(key, { uploading: true, error: "" });

    const { error: storageError } = await supabase.storage
      .from("inspection-photos")
      .remove([photo.photo_url]);

    if (storageError) {
      setStateFor(key, { uploading: false, error: storageError.message });
      return;
    }

    const { error: deleteError } = await (supabase as any)
      .from("contract_inspections")
      .delete()
      .eq("id", photo.id);

    if (deleteError) {
      setStateFor(key, { uploading: false, error: deleteError.message });
      return;
    }

    setPhotos((prev) => prev.filter((item) => item.id !== photo.id));
    setStateFor(key, { uploading: false, error: "" });
  };

  const renderSection = (type: InspectionType, title: string) => {
    const sectionPhotos = photosByType[type];
    const uploadKey = stateKey(type, "upload");
    const uploadState = states[uploadKey] ?? { uploading: false, error: "" };
    const isAtLimit = sectionPhotos.length >= MAX_PHOTOS_PER_SECTION;

    return (
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>

        <div className="grid gap-3 px-3 py-3">
          {sectionPhotos.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {sectionPhotos.map((photo) => {
                const key = stateKey(photo.type, photo.id);
                const photoState = states[key] ?? { uploading: false, error: "" };
                const previewUrl = previewUrls[key];

                return (
                  <div key={photo.id} className="min-w-0">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-muted/30">
                      {previewUrl ? (
                        <img src={previewUrl} alt={`${title} photo`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-5 w-5" aria-hidden="true" />
                        </div>
                      )}

                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        disabled={photoState.uploading}
                        onClick={() => deletePhoto(photo)}
                        aria-label="Delete photo"
                      >
                        {photoState.uploading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </div>

                    {photoState.error && <div className="mt-1 text-[11px] text-destructive">{photoState.error}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={(node) => {
                inputRefs.current[type] = node;
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

            {isAtLimit ? (
              <span className="text-xs font-medium text-muted-foreground">Limit reached</span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 gap-1.5 text-xs sm:min-h-9"
                disabled={uploadState.uploading}
                onClick={() => inputRefs.current[type]?.click()}
              >
                {uploadState.uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {uploadState.uploading ? "Uploading..." : "Add Photos"}
              </Button>
            )}

            <span className="text-xs text-muted-foreground">
              {sectionPhotos.length}/{MAX_PHOTOS_PER_SECTION}
            </span>
          </div>

          {uploadState.error && <div className="text-[11px] text-destructive">{uploadState.error}</div>}
        </div>
      </section>
    );
  };

  return (
    <div className="grid gap-3">
      {states.load?.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {states.load.error}
        </div>
      )}

      {renderSection("pickup", "Pickup Photos")}
      {renderSection("return", "Return Photos")}
    </div>
  );
}
