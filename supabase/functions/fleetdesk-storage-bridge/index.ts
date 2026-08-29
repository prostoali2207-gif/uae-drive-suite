import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const textEncoder = new TextEncoder();

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return hex(new Uint8Array(signature));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

    const url = new URL(req.url);
    const bucket = url.searchParams.get("bucket") || "";
    const path = url.searchParams.get("path") || "";
    const expRaw = url.searchParams.get("exp") || "";
    const sig = (url.searchParams.get("sig") || "").toLowerCase();

    if (!bucket || !path || !expRaw || !sig) return new Response("Unauthorized", { status: 401 });
    if (bucket.includes("/") || path.startsWith("/") || path.includes("..")) return new Response("Invalid path", { status: 400 });

    const exp = Number(expRaw);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(exp) || exp < now || exp > now + 300) return new Response("Expired or invalid ticket", { status: 401 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: config, error: configError } = await supabase
      .from("ai_storage_bridge_config")
      .select("hmac_secret")
      .eq("singleton", true)
      .single();
    if (configError || !config?.hmac_secret) throw configError || new Error("Bridge config missing");

    const message = `${bucket}\n${path}\n${exp}`;
    const expected = await hmacSha256(config.hmac_secret, message);
    if (!safeEqual(expected, sig)) return new Response("Unauthorized", { status: 401 });

    const { data: file, error: downloadError } = await supabase.storage.from(bucket).download(path);
    if (downloadError || !file) {
      return new Response(JSON.stringify({ error: downloadError?.message || "File not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const headers = new Headers();
    headers.set("content-type", file.type || "application/octet-stream");
    headers.set("content-length", String(file.size));
    headers.set("cache-control", "private, no-store, max-age=0");
    headers.set("x-content-type-options", "nosniff");
    const filename = path.split("/").pop() || "download";
    headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    return new Response(file.stream(), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
