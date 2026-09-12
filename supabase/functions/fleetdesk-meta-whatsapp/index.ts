import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const GRAPH_VERSION = "v23.0";

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePlate(value: unknown) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
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
  if (!appSecret) throw new Error("META_APP_SECRET is not configured");
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + hex(new Uint8Array(signature));
  return timingSafeEqual(expected, signatureHeader);
}

async function sendWhatsAppText(phoneNumberId: string, to: string, body: string) {
  const accessToken = Deno.env.get("META_ACCESS_TOKEN") || "";
  if (!accessToken) throw new Error("META_ACCESS_TOKEN is not configured");

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhone(to),
        type: "text",
        text: { preview_url: false, body },
      }),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error?.message || `Meta send failed (${response.status})`));
  }
  return data;
}

async function getActiveStaff(supabase: ReturnType<typeof createClient>, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data: staffRows, error: staffError } = await supabase
    .from("staff")
    .select("id, owner_id, full_name, role, phone, status")
    .eq("status", "active");
  if (staffError) throw staffError;

  const direct = (staffRows || []).filter((row: any) => normalizePhone(row.phone) === normalized);
  if (direct.length > 1) throw new Error("Phone matches more than one active staff account");
  if (direct.length === 1) return direct[0];

  const { data: alias, error: aliasError } = await supabase
    .from("staff_phone_aliases")
    .select("staff_id")
    .eq("normalized_phone", normalized)
    .eq("status", "active")
    .maybeSingle();
  if (aliasError) throw aliasError;
  if (!alias?.staff_id) return null;

  const { data: staff, error: staffByAliasError } = await supabase
    .from("staff")
    .select("id, owner_id, full_name, role, phone, status")
    .eq("id", alias.staff_id)
    .eq("status", "active")
    .maybeSingle();
  if (staffByAliasError) throw staffByAliasError;
  return staff || null;
}

function formatAvailable(cars: any[]) {
  if (!cars.length) return "Сейчас свободных машин нет.";
  return "Доступные авто:\n" + cars.slice(0, 20).map((car) =>
    `• ${car.plate} — ${car.make || ""} ${car.model || ""}`.trim()
  ).join("\n");
}

async function findContracts(supabase: ReturnType<typeof createClient>, ownerId: string, queryText: string) {
  const { data, error } = await supabase
    .from("contracts")
    .select("id, start_date, start_time, end_date, end_time, rate_type, rate_amount, total_amount, deposit_amount, status, payment_status, client:clients(id, full_name, phone), car:cars(id, plate, make, model, status)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const raw = queryText.trim();
  const ref = raw.replace(/^CTR-/i, "").toLowerCase();
  const plate = normalizePlate(raw);

  const matches = (data || []).filter((row: any) => {
    const byRef = ref.length >= 4 && String(row.id || "").toLowerCase().startsWith(ref);
    const byPlate = plate && normalizePlate(row.car?.plate) === plate;
    return byRef || byPlate;
  }).slice(0, 10);

  const ids = matches.map((row: any) => row.id);
  const balances: Record<string, any> = {};
  if (ids.length) {
    const { data: rows, error: balanceError } = await supabase
      .from("contract_balances")
      .select("contract_id, payment_status, balance_due")
      .in("contract_id", ids);
    if (balanceError) throw balanceError;
    for (const row of rows || []) balances[row.contract_id] = row;
  }

  return matches.map((row: any) => ({
    ...row,
    contract_number: "CTR-" + String(row.id).slice(0, 8).toUpperCase(),
    outstanding: Number(balances[row.id]?.balance_due || 0),
    payment_status: balances[row.id]?.payment_status || row.payment_status,
  }));
}

function formatContracts(rows: any[]) {
  if (!rows.length) return "Контракт не найден.";
  return rows.map((c) =>
    `${c.contract_number} — ${c.car?.plate || "без номера"} — ${c.status} — баланс ${c.outstanding} AED`
  ).join("\n");
}

async function beginAudit(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  messageId: string,
  staff: any,
  sender: string,
  text: string,
) {
  const key = `meta-message:${messageId}`;
  const { data: existing, error: findError } = await supabase
    .from("whatsapp_operation_requests")
    .select("id, status")
    .eq("owner_id", ownerId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return { duplicate: true, id: existing.id };

  const { data, error } = await supabase
    .from("whatsapp_operation_requests")
    .insert({
      owner_id: ownerId,
      idempotency_key: key,
      actor_phone: sender,
      actor_type: "staff",
      actor_staff_id: staff.id,
      actor_client_id: null,
      action: "meta_command",
      contract_id: null,
      payload: { message_id: messageId, text },
      status: "received",
    })
    .select("id")
    .single();

  if (error) {
    if ((error as any).code === "23505") return { duplicate: true, id: null };
    throw error;
  }
  return { duplicate: false, id: data.id as string };
}

async function finishAudit(
  supabase: ReturnType<typeof createClient>,
  id: string | null,
  status: "applied" | "failed",
  result: unknown,
) {
  if (!id) return;
  const { error } = await supabase
    .from("whatsapp_operation_requests")
    .update({ status, result, processed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function handleCommand(
  supabase: ReturnType<typeof createClient>,
  staff: any,
  text: string,
) {
  const cmd = text.replace(/^fd\s*/i, "").trim();

  if (/^(авто|машины|доступные авто|свободные машины)$/i.test(cmd)) {
    const { data: cars, error } = await supabase
      .from("cars")
      .select("plate, make, model, year, status")
      .eq("owner_id", staff.owner_id)
      .eq("status", "Available")
      .order("plate");
    if (error) throw error;
    return formatAvailable(cars || []);
  }

  const contractMatch = cmd.match(/^(?:контракт|договор)\s+(.+)$/i);
  if (contractMatch) {
    const contracts = await findContracts(supabase, staff.owner_id, contractMatch[1]);
    return formatContracts(contracts);
  }

  return "Команда не распознана. Примеры:\nfd авто\nfd контракт 73558";
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_VERIFY_TOKEN") || "";

    if (mode === "subscribe" && expected && token === expected && challenge) {
      return textResponse(challenge, 200);
    }
    return textResponse("Forbidden", 403);
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  try {
    if (!(await verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256")))) {
      return json({ error: "Invalid Meta signature" }, 401);
    }
  } catch (error) {
    console.error(error);
    return json({ error: "Meta webhook security is not configured" }, 503);
  }

  const body = JSON.parse(rawBody || "{}");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ error: "FleetDesk service configuration is incomplete" }, 500);

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (body?.object !== "whatsapp_business_account") return json({ ok: true });

    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== "messages") continue;

        const value = change?.value || {};
        const phoneNumberId = String(value?.metadata?.phone_number_id || "");
        if (!phoneNumberId) continue;

        for (const message of value?.messages || []) {
          if (message?.type !== "text") continue;

          const sender = String(message?.from || "");
          const text = String(message?.text?.body || "").trim();
          const messageId = String(message?.id || "");
          if (!sender || !messageId || !/^fd\b/i.test(text)) continue;

          const staff = await getActiveStaff(supabase, sender);
          if (!staff?.owner_id) {
            await sendWhatsAppText(phoneNumberId, sender, "Этот номер не зарегистрирован как активный сотрудник FleetDesk.");
            continue;
          }

          const audit = await beginAudit(supabase, staff.owner_id, messageId, staff, sender, text);
          if (audit.duplicate) continue;

          try {
            const responseText = await handleCommand(supabase, staff, text);
            const metaResult = await sendWhatsAppText(phoneNumberId, sender, responseText);
            await finishAudit(supabase, audit.id, "applied", {
              reply: responseText,
              meta_message_id: metaResult?.messages?.[0]?.id || null,
            });
          } catch (error) {
            const messageText = error instanceof Error ? error.message : "Ошибка FleetDesk";
            try {
              await sendWhatsAppText(phoneNumberId, sender, "Ошибка FleetDesk: " + messageText);
            } finally {
              await finishAudit(supabase, audit.id, "failed", { error: messageText });
            }
          }
        }
      }
    }

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    // Acknowledge to avoid uncontrolled Meta retries; failures are logged in Supabase/Edge logs.
    return json({ ok: true });
  }
});
