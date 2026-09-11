import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const PEACH_TOKEN_SHA256 = "a837eb5861426d57f2b47398aac8f43dc3852a4d74651aecfb0ccb6ccb73dc6f";
const GATEWAY_URL = "https://vlcxjizieelcfunausll.supabase.co/functions/v1/fleetdesk-whatsapp-gateway";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function reply(text: string) {
  return json({ changes: [{ action: "send_message", message: { text } }] });
}
function noReply() {
  return json({ changes: [] });
}
async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}
async function getActiveStaff(supabase: any, phone: string) {
  const normalized = normalizePhone(phone);
  const { data: staffRows, error } = await supabase.from("staff")
    .select("id, owner_id, full_name, role, phone, status").eq("status", "active");
  if (error) throw error;
  const direct = (staffRows || []).filter((r: any) => normalizePhone(r.phone) === normalized);
  if (direct.length === 1) return direct[0];
  const { data: alias, error: ae } = await supabase.from("staff_phone_aliases")
    .select("staff_id").eq("normalized_phone", normalized).eq("status", "active").maybeSingle();
  if (ae) throw ae;
  if (!alias?.staff_id) return null;
  const { data: staff, error: se } = await supabase.from("staff")
    .select("id, owner_id, full_name, role, phone, status")
    .eq("id", alias.staff_id).eq("status", "active").maybeSingle();
  if (se) throw se;
  return staff;
}
async function callGateway(token: string, body: unknown) {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Peach-Token": token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error || "FleetDesk request failed"));
  return data;
}
function formatAvailable(cars: any[]) {
  if (!cars.length) return "Сейчас свободных машин нет.";
  return "Доступные авто:\n" + cars.slice(0, 20).map(c =>
    `• ${c.plate} — ${c.make || ""} ${c.model || ""}`.trim()
  ).join("\n");
}
function formatContracts(data: any) {
  const rows = data?.contracts || [];
  if (!rows.length) return "Контракт не найден.";
  return rows.slice(0, 10).map((c: any) =>
    `${c.contract_number} — ${c.car?.plate || "без номера"} — ${c.status} — баланс ${Number(c.outstanding || 0)} AED`
  ).join("\n");
}
function formatFinance(data: any) {
  const matches = data?.matches || [];
  if (!matches.length) return "Статья не найдена.";
  return matches.slice(0, 10).map((m: any) =>
    `• ${m.article} — строка ${m.row}${m.section ? " — " + m.section : ""}`
  ).join("\n");
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("x-peach-token") || new URL(req.url).searchParams.get("token") || "";
  if (!token || await sha256Hex(token) !== PEACH_TOKEN_SHA256) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const request = body?.request || {};
    const eventPayload = request?.payload || {};
    const phone = String(
      eventPayload?.subscriber?.phone_number ||
      eventPayload?.contact?.phone_number ||
      request?.subscriber?.phone_number ||
      request?.contact?.phone_number ||
      ""
    );
    const text = String(
      eventPayload?.message?.text ||
      request?.message?.text ||
      ""
    ).trim();
    if (!phone || !text) return noReply();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const staff = await getActiveStaff(supabase, phone);

    if (!/^fd\b/i.test(text)) return noReply();
    if (!staff?.owner_id) return reply("Этот номер не зарегистрирован как активный сотрудник FleetDesk.");

    const cmd = text.replace(/^fd\s*/i, "").trim();

    if (/^(авто|машины|доступные авто|свободные машины)$/i.test(cmd)) {
      const { data: cars, error } = await supabase.from("cars")
        .select("plate, make, model, year, status")
        .eq("owner_id", staff.owner_id).eq("status", "Available").order("plate");
      if (error) throw error;
      return reply(formatAvailable(cars || []));
    }

    const contractMatch = cmd.match(/^(?:контракт|договор)\s+(.+)$/i);
    if (contractMatch) {
      const q = contractMatch[1].trim();
      const isPlate = !/^CTR-/i.test(q) && !/^[0-9a-f-]{8,}$/i.test(q);
      const result = await callGateway(token, {
        name: "find_contracts",
        arguments: isPlate ? { plate: q, include_closed: true } : { contract_reference: q, include_closed: true },
        contact: { phone_number: phone }
      });
      return reply(formatContracts(result));
    }

    const fin = cmd.match(/^финансы\s+(наличные|ajman|сбер)\s+(\d{2})\.(\d{2})(?:\.(\d{2,4}))?\s+(.+)$/i);
    if (fin) {
      const account = fin[1].toLowerCase() === "наличные" ? "cash_aed" :
        fin[1].toLowerCase() === "ajman" ? "ajman_aed" : "sber_rub";
      const yearRaw = fin[4];
      const year = yearRaw ? (yearRaw.length === 2 ? "20" + yearRaw : yearRaw) : "2026";
      const date = `${year}-${fin[3]}-${fin[2]}`;
      const result = await callGateway(token, {
        name: "find_finance_articles",
        arguments: { account, date, query: fin[5].trim() },
        contact: { phone_number: phone }
      });
      return reply(formatFinance(result));
    }

    return reply("Команда не распознана. Примеры:\nfd авто\nfd контракт 73558\nfd финансы наличные 01.10 Мойка авто");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка FleetDesk";
    return reply("Ошибка: " + message);
  }
});