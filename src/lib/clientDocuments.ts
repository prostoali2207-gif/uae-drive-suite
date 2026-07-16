import { supabase } from "@/lib/supabase";

const CLIENT_DOCUMENTS_BUCKET = "client-documents";
const SIGNED_URL_TTL_SECONDS = 300;

export const getClientDocumentPath = (storedUrl: string | null): string | null => {
  if (!storedUrl?.trim()) return null;

  try {
    const url = new URL(storedUrl, window.location.origin);
    const marker = `/${CLIENT_DOCUMENTS_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    const encodedPath = markerIndex >= 0
      ? url.pathname.slice(markerIndex + marker.length)
      : url.origin === window.location.origin
        ? url.pathname.replace(/^\/+/, "")
        : "";
    const path = decodeURIComponent(encodedPath).replace(/^\/+/, "").trim();

    if (!path || path.split("/").includes("..") || /[\\\x00-\x1f]/.test(path)) return null;
    return path;
  } catch {
    return null;
  }
};

export const createClientDocumentSignedUrl = async (storedUrl: string | null): Promise<string> => {
  const path = getClientDocumentPath(storedUrl);
  if (!path) throw new Error("Invalid client document URL");

  const { data, error } = await supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) throw error || new Error("Signed document URL was not returned");
  return data.signedUrl;
};
