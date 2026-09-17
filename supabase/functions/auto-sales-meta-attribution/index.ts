import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const GRAPH_VERSION = "v23.0";
const AUTO_SALES_WABA_ID = "115166331454166";
const AUTO_SALES_PHONE = "971503432337";
const FUNCTION_SLUG = "auto-sales-meta-attribution";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return timingSafeEqual("sha256=" + hex(new Uint8Array(signature)), signatureHeader);
}

function db() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRole) throw new Error("Supabase service credentials are not configured");
  return createClient(url, serviceRole, { auth: { persistSession: false } });
}

async function getSecret(supabase: ReturnType<typeof createClient>, name: string) {
  const { data, error } = await supabase
    .from("service_integration_secrets")
    .select("secret_value")
    .eq("secret_name", name)
    .maybeSingle();
  if (error) throw error;
  return String(data?.secret_value || "");
}

async function graph(path: string, init: RequestInit = {}) {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
  if (!accessToken) throw new Error("META_ACCESS_TOKEN is not configured");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    ...init,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function adminStatus() {
  const [subscriptions, phones] = await Promise.all([
    graph(`${AUTO_SALES_WABA_ID}/subscribed_apps`),
    graph(`${AUTO_SALES_WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name`),
  ]);

  return {
    waba_id: AUTO_SALES_WABA_ID,
    expected_phone: AUTO_SALES_PHONE,
    subscriptions: {
      ok: subscriptions.ok,
      status: subscriptions.status,
      data: subscriptions.data,
    },
    phones: {
      ok: phones.ok,
      status: phones.status,
      data: phones.data,
    },
  };
}

async function subscribeThisWebhook(supabase: ReturnType<typeof createClient>) {
  const verifyToken = await getSecret(supabase, "auto_sales_meta_verify_token");
  if (!verifyToken) throw new Error("auto_sales_meta_verify_token is not configured");

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");

  const callbackUrl = `${supabaseUrl}/functions/v1/${FUNCTION_SLUG}`;
  const result = await graph(`${AUTO_SALES_WABA_ID}/subscribed_apps`, {
    method: "POST",
    body: JSON.stringify({
      override_callback_uri: callbackUrl,
      verify_token: verifyToken,
    }),
  });

  return { callback_url: callbackUrl, ...result };
}

async function handleAdmin(
  req: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
) {
  const provided = url.searchParams.get("diag_key") || "";
  const expected = await getSecret(supabase, "auto_sales_meta_diag_key");
  if (!provided || !expected || !timingSafeEqual(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const action = url.searchParams.get("admin") || "status";
  if (action === "status" && req.method === "GET") return json(await adminStatus());
  if (action === "subscribe" && req.method === "POST") {
    return json(await subscribeThisWebhook(supabase));
  }
  return json({ error: "unsupported_admin_action" }, 400);
}

async function verifyWebhook(url: URL, supabase: ReturnType<typeof createClient>) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || "";
  const expected = await getSecret(supabase, "auto_sales_meta_verify_token");

  if (mode === "subscribe" && expected && timingSafeEqual(token, expected)) {
    return text(challenge);
  }
  return text("Forbidden", 403);
}

function toCapturedAt(timestamp: unknown) {
  const n = Number(timestamp);
  return Number.isFinite(n) && n > 0
    ? new Date(n * 1000).toISOString()
    : new Date().toISOString();
}

async function storeReferralPayload(payload: any, supabase: ReturnType<typeof createClient>) {
  let stored = 0;
  let ignored = 0;

  for (const entry of payload?.entry || []) {
    const entryWaba = String(entry?.id || "");
    if (entryWaba && entryWaba !== AUTO_SALES_WABA_ID) {
      ignored += 1;
      continue;
    }

    for (const change of entry?.changes || []) {
      if (change?.field !== "messages") continue;
      const value = change?.value || {};
      const metadata = value?.metadata || {};
      const displayPhone = normalizePhone(metadata?.display_phone_number);
      if (displayPhone && displayPhone !== AUTO_SALES_PHONE) {
        ignored += 1;
        continue;
      }

      for (const message of value?.messages || []) {
        const referral = message?.referral;
        const sourceId = String(referral?.source_id || "");
        const messageId = String(message?.id || "");
        const from = normalizePhone(message?.from);

        if (!referral || !sourceId || !messageId || !from) {
          ignored += 1;
          continue;
        }

        const sourceType = referral?.source_type ? String(referral.source_type) : null;
        const row = {
          captured_at: toCapturedAt(message?.timestamp),
          message_id: messageId,
          contact_phone: `+${from}`,
          waba_id: AUTO_SALES_WABA_ID,
          business_phone_number_id: metadata?.phone_number_id
            ? String(metadata.phone_number_id)
            : null,
          display_phone_number: metadata?.display_phone_number
            ? String(metadata.display_phone_number)
            : null,
          source_type: sourceType,
          source_id: sourceId,
          ad_id: sourceType === "ad" ? sourceId : null,
          source_url: referral?.source_url ? String(referral.source_url) : null,
          headline: referral?.headline ? String(referral.headline) : null,
          body: referral?.body ? String(referral.body) : null,
          media_type: referral?.media_type ? String(referral.media_type) : null,
          ctwa_clid: referral?.ctwa_clid ? String(referral.ctwa_clid) : null,
          confidence: "DETERMINISTIC",
          raw_referral: referral,
          raw_message: message,
        };

        const { error } = await supabase
          .from("auto_sales_whatsapp_attribution")
          .upsert(row, { onConflict: "message_id", ignoreDuplicates: true });
        if (error) throw error;
        stored += 1;
      }
    }
  }

  return { stored, ignored };
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = db();
    const url = new URL(req.url);

    if (url.searchParams.has("admin")) {
      return await handleAdmin(req, url, supabase);
    }

    if (req.method === "GET") return await verifyWebhook(url, supabase);
    if (req.method !== "POST") return text("Method Not Allowed", 405);

    const rawBody = await req.text();
    const signatureOk = await verifyMetaSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
    );
    if (!signatureOk) return text("Invalid signature", 401);

    const payload = JSON.parse(rawBody || "{}");
    const result = await storeReferralPayload(payload, supabase);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("auto-sales-meta-attribution", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
