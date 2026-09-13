import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const GRAPH_VERSION = "v23.0";
const GATEWAY_URL = "https://vlcxjizieelcfunausll.supabase.co/functions/v1/fleetdesk-whatsapp-gateway";

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

async function callFleetDeskGateway(
  supabase: ReturnType<typeof createClient>,
  body: unknown,
) {
  const { data: secretRow, error: secretError } = await supabase
    .from("service_integration_secrets")
    .select("secret_value")
    .eq("secret_name", "fleetdesk_gateway_token")
    .maybeSingle();
  if (secretError) throw secretError;

  const token = String(secretRow?.secret_value || "");
  if (!token) throw new Error("FleetDesk finance connection is not configured");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Peach-Token": token,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error || "FleetDesk gateway request failed"));
  }
  return data;
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

async function sendWhatsAppList(
  phoneNumberId: string,
  to: string,
  header: string,
  body: string,
  button: string,
  rows: Array<{ id: string; title: string; description?: string }>,
) {
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
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: header },
          body: { text: body },
          action: {
            button,
            sections: [{
              title: "FleetDesk",
              rows: rows.map((row) => ({
                id: row.id,
                title: row.title,
                ...(row.description ? { description: row.description } : {}),
              })),
            }],
          },
        },
      }),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error?.message || `Meta list send failed (${response.status})`));
  }
  return data;
}

async function sendWhatsAppButtons(
  phoneNumberId: string,
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
) {
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
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: {
            buttons: buttons.slice(0, 3).map((button) => ({
              type: "reply",
              reply: { id: button.id, title: button.title },
            })),
          },
        },
      }),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error?.message || `Meta button send failed (${response.status})`));
  }
  return data;
}

function financeMenuRows() {
  return [
    { id: "fd_finance_cash", title: "Наличные AED", description: "Блок наличных в «Движении денег»" },
    { id: "fd_finance_ajman", title: "Ajman AED", description: "Банковский блок AJMAN" },
    { id: "fd_finance_sber", title: "Сбер RUB", description: "Рублёвый блок СБЕР" },
  ];
}

function financeAccountFromCommand(text: string) {
  if (/^fd\s+finance_cash$/i.test(text)) return "cash_aed";
  if (/^fd\s+finance_ajman$/i.test(text)) return "ajman_aed";
  if (/^fd\s+finance_sber$/i.test(text)) return "sber_rub";
  return null;
}

function financeAccountLabel(account: string) {
  if (account === "cash_aed") return "Наличные AED";
  if (account === "ajman_aed") return "Ajman AED";
  if (account === "sber_rub") return "Сбер RUB";
  return account;
}

function financeCurrency(account: string) {
  return account === "sber_rub" ? "RUB" : "AED";
}

function dubaiDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

function parseFinanceEntry(text: string) {
  let value = String(text || "").trim();
  let date = dubaiDate();

  if (/^вчера\s+/i.test(value)) {
    date = dubaiDate(-1);
    value = value.replace(/^вчера\s+/i, "").trim();
  } else {
    const dateMatch = value.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s+/);
    if (dateMatch) {
      const yearRaw = dateMatch[3];
      const year = yearRaw ? (yearRaw.length === 2 ? "20" + yearRaw : yearRaw) : dubaiDate().slice(0, 4);
      date = `${year}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[1]).padStart(2, "0")}`;
      value = value.slice(dateMatch[0].length).trim();
    }
  }

  const amountMatch = value.match(/^(\d+(?:[.,]\d{1,2})?)\s+(.+)$/);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1].replace(",", "."));
  const query = amountMatch[2].trim();
  if (!(amount > 0) || !query) return null;
  return { date, amount, query };
}

function normalizeFinanceText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function financeSearchToken(query: string) {
  const tokens = normalizeFinanceText(query).split(" ").filter(Boolean);
  const plateLike = tokens.find((t) => /\d{4,}/.test(t));
  if (plateLike) return plateLike;
  return tokens.find((t) => t.length >= 3) || query;
}

function rankFinanceMatches(query: string, matches: any[]) {
  const ignored = new Set(["авто", "машина", "оплата", "расход", "доход", "за", "на"]);
  const tokens = normalizeFinanceText(query)
    .split(" ")
    .filter((t) => t.length >= 2 && !ignored.has(t));

  return (matches || []).map((match: any) => {
    const hay = normalizeFinanceText(`${match.article || ""} ${match.section || ""}`);
    const score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0);
    return { ...match, score };
  }).sort((a: any, b: any) => b.score - a.score || Number(a.row) - Number(b.row));
}

function mainMenuRows() {
  return [
    { id: "fd_section_cars", title: "Авто", description: "Доступность и поиск машины" },
    { id: "fd_section_contracts", title: "Контракты", description: "Активные и поиск договора" },
    { id: "fd_section_clients", title: "Клиенты", description: "Поиск клиента" },
    { id: "fd_section_finance", title: "Финансы", description: "Таблица «Движение денег»" },
    { id: "fd_section_handover", title: "Сдали / приняли", description: "Выдача, возврат и замена авто" },
  ];
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

function formatFinance(data: any) {
  const matches = data?.matches || [];
  if (!matches.length) return "Статья не найдена.";
  return matches.slice(0, 10).map((m: any) =>
    `• ${m.article} — строка ${m.row}${m.section ? " — " + m.section : ""}`
  ).join("\n");
}

async function findClientsForStaff(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  queryText: string,
) {
  const query = String(queryText || "").trim();
  if (!query) return [];
  const digits = normalizePhone(query);

  const { data, error } = await supabase
    .from("clients")
    .select("id, full_name, phone, nationality, license_number, license_expiry, passport_number, passport_expiry")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const q = query.toLowerCase();
  return (data || []).filter((row: any) => {
    const byName = String(row.full_name || "").toLowerCase().includes(q);
    const byPhone = digits && normalizePhone(row.phone).includes(digits);
    return byName || byPhone;
  }).slice(0, 10);
}

function formatClients(rows: any[]) {
  if (!rows.length) return "Клиент не найден.";
  return rows.map((c) =>
    `• ${c.full_name || "Без имени"} — ${c.phone || "без телефона"}${c.nationality ? " — " + c.nationality : ""}`
  ).join("\n");
}

async function listOpenContracts(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
) {
  const { data, error } = await supabase
    .from("contracts")
    .select("id, end_date, end_time, status, client:clients(full_name), car:cars(plate, make, model)")
    .eq("owner_id", ownerId)
    .in("status", ["Active", "Expiring Soon"])
    .order("end_date", { ascending: true })
    .limit(15);
  if (error) throw error;
  return data || [];
}

function formatOpenContracts(rows: any[]) {
  if (!rows.length) return "Открытых контрактов нет.";
  return rows.map((c: any) =>
    `• ${c.car?.plate || "без номера"} — ${c.client?.full_name || "без клиента"} — до ${c.end_date || "?"}`
  ).join("\n");
}

async function getCarByPlate(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  plateInput: string,
) {
  const target = normalizePlate(plateInput);
  const { data, error } = await supabase
    .from("cars")
    .select("plate, make, model, year, color, status, insurance_expiry, mulkiya_expiry, tag_number")
    .eq("owner_id", ownerId);
  if (error) throw error;
  return (data || []).find((car: any) => normalizePlate(car.plate) === target) || null;
}

function formatCar(car: any) {
  if (!car) return "Машина не найдена.";
  return [
    `${car.plate} — ${car.make || ""} ${car.model || ""} ${car.year || ""}`.trim(),
    `Статус: ${car.status || "—"}`,
    car.color ? `Цвет: ${car.color}` : null,
    car.mulkiya_expiry ? `Mulkiya до: ${car.mulkiya_expiry}` : null,
    car.insurance_expiry ? `Страховка до: ${car.insurance_expiry}` : null,
  ].filter(Boolean).join("\n");
}

async function listFines(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  plateInput?: string,
) {
  const { data, error } = await supabase
    .from("fines")
    .select("fine_date, fine_type, fine_number, amount, original_amount, service_fee, status, black_points, car:cars(plate, make, model)")
    .eq("owner_id", ownerId)
    .in("status", ["Unpaid", "Partial"])
    .order("fine_date", { ascending: false })
    .limit(80);
  if (error) throw error;
  const target = plateInput ? normalizePlate(plateInput) : "";
  return (data || []).filter((row: any) => !target || normalizePlate(row.car?.plate) === target).slice(0, 10);
}

function formatFines(rows: any[]) {
  if (!rows.length) return "Неоплаченных штрафов не найдено.";
  return rows.map((r: any) =>
    `• ${r.car?.plate || "без номера"} — ${Number(r.amount || 0)} AED — ${String(r.fine_date || "").slice(0, 10)}${r.black_points ? " — " + r.black_points + " BP" : ""}`
  ).join("\n");
}

async function listSalik(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  plateInput?: string,
) {
  const { data, error } = await supabase
    .from("salik")
    .select("charge_date, trip_time, toll_gate, amount, original_amount, service_fee, status, car:cars(plate, make, model)")
    .eq("owner_id", ownerId)
    .eq("status", "Unpaid")
    .order("charge_date", { ascending: false })
    .limit(120);
  if (error) throw error;
  const target = plateInput ? normalizePlate(plateInput) : "";
  return (data || []).filter((row: any) => !target || normalizePlate(row.car?.plate) === target).slice(0, 10);
}

function formatSalik(rows: any[]) {
  if (!rows.length) return "Неоплаченных Salik не найдено.";
  return rows.map((r: any) =>
    `• ${r.car?.plate || "без номера"} — ${Number(r.amount || 0)} AED — ${r.charge_date || "?"}${r.toll_gate ? " — " + r.toll_gate : ""}`
  ).join("\n");
}

async function listParking(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  plateInput?: string,
) {
  const { data, error } = await supabase
    .from("parking_charges")
    .select("parking_date, plate_number, location, parking_zone, amount, original_amount, service_fee, status, car:cars(plate, make, model)")
    .eq("owner_id", ownerId)
    .eq("status", "Unpaid")
    .order("parking_date", { ascending: false })
    .limit(120);
  if (error) throw error;
  const target = plateInput ? normalizePlate(plateInput) : "";
  return (data || []).filter((row: any) => {
    if (!target) return true;
    return normalizePlate(row.car?.plate || row.plate_number) === target;
  }).slice(0, 10);
}

function formatParking(rows: any[]) {
  if (!rows.length) return "Неоплаченных парковок не найдено.";
  return rows.map((r: any) =>
    `• ${r.car?.plate || r.plate_number || "без номера"} — ${Number(r.amount || 0)} AED — ${String(r.parking_date || "").slice(0, 10)}${r.location ? " — " + r.location : ""}`
  ).join("\n");
}


async function getSectionChannel(
  supabase: ReturnType<typeof createClient>,
  phoneNumberId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_section_channels")
    .select("phone_number_id, display_phone_number, section, status")
    .eq("phone_number_id", phoneNumberId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function formatDubaiTime(value: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function getRentalActivityFeed(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  queryText = "",
) {
  const { data: events, error } = await supabase
    .from("rental_activity_events")
    .select("id, event_type, event_at, contract_id, car_id, details, contract:contracts(id, start_date, start_time, end_date, end_time, rate_type, rate_amount, client:clients(full_name, phone), car:cars(plate, make, model)), car:cars(plate, make, model)")
    .eq("owner_id", ownerId)
    .order("event_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const contractIds = Array.from(new Set((events || []).map((e: any) => e.contract_id).filter(Boolean)));
  const balances: Record<string, any> = {};
  if (contractIds.length) {
    const { data: rows, error: balanceError } = await supabase
      .from("contract_balances")
      .select("contract_id, total_fees, total_paid")
      .in("contract_id", contractIds);
    if (balanceError) throw balanceError;
    for (const row of rows || []) balances[row.contract_id] = row;
  }

  const fromCarIds = Array.from(new Set((events || [])
    .map((e: any) => String(e?.details?.from_car_id || ""))
    .filter(Boolean)));
  const fromCars: Record<string, any> = {};
  if (fromCarIds.length) {
    const { data: rows, error: carsError } = await supabase
      .from("cars")
      .select("id, plate, make, model")
      .in("id", fromCarIds);
    if (carsError) throw carsError;
    for (const row of rows || []) fromCars[row.id] = row;
  }

  const q = String(queryText || "").trim().toLowerCase();
  const plateQ = normalizePlate(queryText);
  return (events || []).filter((e: any) => {
    if (!q) return true;
    const contractRef = ("CTR-" + String(e.contract_id || "").slice(0, 8)).toLowerCase();
    const currentPlate = normalizePlate(e.car?.plate || e.contract?.car?.plate);
    const oldPlate = normalizePlate(fromCars[String(e?.details?.from_car_id || "")]?.plate);
    const clientName = String(e.contract?.client?.full_name || "").toLowerCase();
    return contractRef.includes(q) ||
      clientName.includes(q) ||
      (plateQ && (currentPlate.includes(plateQ) || oldPlate.includes(plateQ)));
  }).slice(0, 15).map((e: any) => ({
    ...e,
    balance: balances[e.contract_id] || { total_fees: 0, total_paid: 0 },
    from_car: fromCars[String(e?.details?.from_car_id || "")] || null,
  }));
}

function formatRentalActivity(rows: any[]) {
  if (!rows.length) return "Пока событий нет.";

  return rows.map((e: any) => {
    const ref = "CTR-" + String(e.contract_id || "").slice(0, 8).toUpperCase();
    const client = e.contract?.client?.full_name || "без клиента";
    const car = e.car || e.contract?.car || {};
    const fees = Number(e.balance?.total_fees || 0);
    const paid = Number(e.balance?.total_paid || 0);
    const when = formatDubaiTime(e.event_at);

    if (e.event_type === "vehicle_replacement") {
      const oldPlate = e.from_car?.plate || "—";
      const newPlate = car?.plate || "—";
      return [
        "ЗАМЕНА",
        `${oldPlate} → ${newPlate}`,
        `Контракт: ${ref}`,
        `Клиент: ${client}`,
        `Fees: ${fees} AED`,
        `Оплачено: ${paid} AED`,
        `Время: ${when}`,
      ].join("\n");
    }

    const title = e.event_type === "rental_out" ? "СДАЛИ" : "ПРИНЯЛИ";
    return [
      title,
      `${car?.plate || "—"} — ${car?.make || ""} ${car?.model || ""}`.trim(),
      `Контракт: ${ref}`,
      `Клиент: ${client}`,
      `Fees: ${fees} AED`,
      `Оплачено: ${paid} AED`,
      `Время: ${when}`,
    ].join("\n");
  }).join("\n\n");
}

async function handleSectionMessage(
  supabase: ReturnType<typeof createClient>,
  staff: any,
  section: string,
  rawText: string,
  sender: string,
) {
  const text = String(rawText || "").trim();

  if (section === "cars") {
    const query = text.replace(/^(fd\s*)?(машина|авто)?\s*/i, "").trim();
    if (!query || /^(список|доступные)$/i.test(query)) {
      const { data: cars, error } = await supabase
        .from("cars")
        .select("plate, make, model, year, status")
        .eq("owner_id", staff.owner_id)
        .eq("status", "Available")
        .order("plate");
      if (error) throw error;
      return formatAvailable(cars || []);
    }
    return formatCar(await getCarByPlate(supabase, staff.owner_id, query));
  }

  if (section === "contracts") {
    const query = text.replace(/^(fd\s*)?(контракт|договор)?\s*/i, "").trim();
    if (!query || /^активные$/i.test(query)) {
      return formatOpenContracts(await listOpenContracts(supabase, staff.owner_id));
    }
    return formatContracts(await findContracts(supabase, staff.owner_id, query));
  }

  if (section === "clients") {
    const query = text.replace(/^(fd\s*)?клиент?\s*/i, "").trim();
    if (!query) return "Напиши имя или номер телефона клиента.";
    return formatClients(await findClientsForStaff(supabase, staff.owner_id, query));
  }

  if (section === "finance") {
    if (!text) return "__FINANCE_MENU__";

    const selectedAccount = financeAccountFromCommand(text);
    if (selectedAccount) {
      return `${financeAccountLabel(selectedAccount)} выбраны.\nНапиши сумму и что записать. Например:\n120 мойка 77108\n\nДата автоматически сегодня. Для другой даты: 12.09 120 мойка 77108`;
    }

    const confirmMatch = text.match(/^fd\s+finance_confirm_([0-9a-f-]{36})$/i);
    if (confirmMatch) {
      const draft = await getFinanceDraft(supabase, staff.owner_id, normalizePhone(sender), confirmMatch[1]);
      // Staff aliases may differ from the canonical staff phone; retry by draft ID below through the sender-aware path in the webhook.
      if (!draft) return "Эта операция уже недоступна. Создай её заново.";
      if (draft.status !== "requested") return "Эта операция уже обработана.";

      const payload: any = draft.payload || {};
      const result = await callFleetDeskGateway(supabase, {
        name: "record_finance_entry",
        arguments: {
          account: payload.account,
          date: payload.date,
          article: payload.article,
          row: payload.row,
          amount: payload.amount,
          note: payload.note || "",
        },
        contact: { phone_number: staff.phone },
      });

      await updateFinanceDraft(supabase, draft.id, {
        status: "applied",
        result,
        processed_at: new Date().toISOString(),
      });

      return `Записано.\n${financeAccountLabel(String(payload.account))} — ${payload.article} — ${Number(payload.amount)} ${financeCurrency(String(payload.account))}`;
    }

    const cancelMatch = text.match(/^fd\s+finance_cancel_([0-9a-f-]{36})$/i);
    if (cancelMatch) {
      await updateFinanceDraft(supabase, cancelMatch[1], {
        status: "rejected",
        result: { cancelled: true },
        processed_at: new Date().toISOString(),
      });
      return "Отменено.";
    }

    const pickMatch = text.match(/^fd\s+finance_pick_([0-9a-f-]{36})_(\d+)$/i);
    if (pickMatch) {
      const { data: draft, error } = await supabase
        .from("whatsapp_operation_requests")
        .select("id, payload, status")
        .eq("id", pickMatch[1])
        .eq("owner_id", staff.owner_id)
        .eq("action", "finance_draft")
        .maybeSingle();
      if (error) throw error;
      if (!draft || draft.status !== "requested") return "Эта операция уже недоступна.";

      const payload: any = draft.payload || {};
      const row = Number(pickMatch[2]);
      const candidate = (payload.candidates || []).find((item: any) => Number(item.row) === row);
      if (!candidate) return "Эта строка больше недоступна.";

      const nextPayload = {
        ...payload,
        stage: "confirm",
        article: candidate.article,
        row: candidate.row,
        candidates: undefined,
      };
      await updateFinanceDraft(supabase, draft.id, { payload: nextPayload });
      return "__FINANCE_CONFIRM__:" + draft.id;
    }

    const account = await getFinanceAccountState(supabase, staff.owner_id, normalizePhone(sender));
    if (!account) return "__FINANCE_MENU__";

    const parsed = parseFinanceEntry(text.replace(/^fd\s*/i, "").trim());
    if (!parsed) {
      return `${financeAccountLabel(account)}.\nНапиши так: 120 мойка 77108\nИли с датой: 12.09 120 мойка 77108`;
    }

    let result = await callFleetDeskGateway(supabase, {
      name: "find_finance_articles",
      arguments: {
        account,
        date: parsed.date,
        query: financeSearchToken(parsed.query),
      },
      contact: { phone_number: staff.phone },
    });

    let ranked = rankFinanceMatches(parsed.query, result?.matches || []);
    if (!ranked.length) {
      const fallbackToken = normalizeFinanceText(parsed.query).split(" ").find((t) => t.length >= 3);
      if (fallbackToken && fallbackToken !== financeSearchToken(parsed.query)) {
        result = await callFleetDeskGateway(supabase, {
          name: "find_finance_articles",
          arguments: { account, date: parsed.date, query: fallbackToken },
          contact: { phone_number: staff.phone },
        });
        ranked = rankFinanceMatches(parsed.query, result?.matches || []);
      }
    }

    if (!ranked.length) {
      return `Не нашёл строку «${parsed.query}» в ${financeAccountLabel(account)}. Напиши название или номер машины точнее.`;
    }

    const topScore = Number(ranked[0]?.score || 0);
    const best = ranked.filter((item: any) => Number(item.score || 0) === topScore);
    if (best.length === 1) {
      const candidate = best[0];
      const draftId = await createFinanceDraft(supabase, staff, normalizePhone(sender), {
        stage: "confirm",
        account,
        date: parsed.date,
        amount: parsed.amount,
        query: parsed.query,
        article: candidate.article,
        row: candidate.row,
        note: "",
      });
      return "__FINANCE_CONFIRM__:" + draftId;
    }

    const candidates = best.slice(0, 8).map((item: any) => ({
      row: Number(item.row),
      article: String(item.article || ""),
      section: String(item.section || ""),
    }));
    const draftId = await createFinanceDraft(supabase, staff, normalizePhone(sender), {
      stage: "choose_article",
      account,
      date: parsed.date,
      amount: parsed.amount,
      query: parsed.query,
      candidates,
      note: "",
    });
    return "__FINANCE_PICK__:" + draftId;
  }

  if (section === "handover") {
    const query = text
      .replace(/^fd\s*/i, "")
      .replace(/^(сдали|приняли|замена|последние)\s*/i, "")
      .trim();
    return formatRentalActivity(await getRentalActivityFeed(supabase, staff.owner_id, query));
  }

  return "Раздел FleetDesk не настроен.";
}

async function getFinanceAccountState(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  sender: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_operation_requests")
    .select("payload, created_at")
    .eq("owner_id", ownerId)
    .eq("actor_phone", sender)
    .eq("action", "meta_command")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  for (const row of data || []) {
    const text = String((row as any)?.payload?.text || "").trim();
    const account = financeAccountFromCommand(text);
    if (account) return account;

    if (/^fd(?:\s+(?:меню|помощь|help|команды))?$/i.test(text)) return null;
    const section = text.match(/^fd\s+section_(cars|contracts|clients|finance|handover)$/i);
    if (section) return null;
  }

  return null;
}

async function createFinanceDraft(
  supabase: ReturnType<typeof createClient>,
  staff: any,
  sender: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("whatsapp_operation_requests")
    .insert({
      owner_id: staff.owner_id,
      idempotency_key: "finance-draft:" + crypto.randomUUID(),
      actor_phone: sender,
      actor_type: "staff",
      actor_staff_id: staff.id,
      actor_client_id: null,
      action: "finance_draft",
      contract_id: null,
      payload,
      status: "requested",
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

async function getFinanceDraft(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  sender: string,
  draftId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_operation_requests")
    .select("id, payload, status, result")
    .eq("id", draftId)
    .eq("owner_id", ownerId)
    .eq("actor_phone", sender)
    .eq("action", "finance_draft")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function updateFinanceDraft(
  supabase: ReturnType<typeof createClient>,
  draftId: string,
  values: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("whatsapp_operation_requests")
    .update(values)
    .eq("id", draftId)
    .eq("action", "finance_draft");
  if (error) throw error;
}

function financeConfirmText(payload: any) {
  return [
    "Записать в «Движение денег»?",
    `Счёт: ${financeAccountLabel(String(payload.account || ""))}`,
    `Дата: ${payload.date}`,
    `Статья: ${payload.article}`,
    `Сумма: ${Number(payload.amount || 0)} ${financeCurrency(String(payload.account || ""))}`,
  ].join("\n");
}

function truncateWhatsAppTitle(value: unknown, max = 24) {
  const text = String(value || "").trim();
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

async function getConversationSection(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  sender: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_operation_requests")
    .select("payload, created_at")
    .eq("owner_id", ownerId)
    .eq("actor_phone", sender)
    .eq("action", "meta_command")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  for (const row of data || []) {
    const text = String((row as any)?.payload?.text || "").trim();

    if (/^fd(?:\s+(?:меню|помощь|help|команды))?$/i.test(text)) {
      return null;
    }

    const match = text.match(/^fd\s+section_(cars|contracts|clients|finance|handover)$/i);
    if (match) return match[1].toLowerCase();
  }

  return null;
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

  if (!cmd || /^(меню|помощь|help|команды)$/i.test(cmd)) {
    return "__MAIN_MENU__";
  }

  if (/^section_cars$/i.test(cmd)) {
    const { data: cars, error } = await supabase
      .from("cars")
      .select("plate, make, model, year, status")
      .eq("owner_id", staff.owner_id)
      .eq("status", "Available")
      .order("plate");
    if (error) throw error;
    return "АВТО\n" + formatAvailable(cars || []) + "\n\nПоиск машины: fd машина 77108";
  }

  if (/^section_contracts$/i.test(cmd)) {
    const rows = await listOpenContracts(supabase, staff.owner_id);
    return "КОНТРАКТЫ\n" + formatOpenContracts(rows) + "\n\nПоиск: fd контракт 73558";
  }

  if (/^section_clients$/i.test(cmd)) {
    return "КЛИЕНТЫ\nПоиск по имени или телефону:\nfd клиент +97150...\nfd клиент Имя";
  }

  if (/^section_finance$/i.test(cmd)) {
    return "__FINANCE_MENU__";
  }

  if (/^section_fines$/i.test(cmd)) {
    const rows = await listFines(supabase, staff.owner_id);
    return "ШТРАФЫ\n" + formatFines(rows) + "\n\nПо машине: fd штрафы 77108";
  }

  if (/^section_salik$/i.test(cmd)) {
    const rows = await listSalik(supabase, staff.owner_id);
    return "SALIK\n" + formatSalik(rows) + "\n\nПо машине: fd salik 77108";
  }

  if (/^section_parking$/i.test(cmd)) {
    const rows = await listParking(supabase, staff.owner_id);
    return "ПАРКОВКИ\n" + formatParking(rows) + "\n\nПо машине: fd парковки 77108";
  }

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

  const carMatch = cmd.match(/^машина\s+(.+)$/i);
  if (carMatch) {
    return formatCar(await getCarByPlate(supabase, staff.owner_id, carMatch[1]));
  }

  if (/^контракты$/i.test(cmd)) {
    return formatOpenContracts(await listOpenContracts(supabase, staff.owner_id));
  }

  const contractMatch = cmd.match(/^(?:контракт|договор)\s+(.+)$/i);
  if (contractMatch) {
    const contracts = await findContracts(supabase, staff.owner_id, contractMatch[1]);
    return formatContracts(contracts);
  }

  const clientMatch = cmd.match(/^клиент\s+(.+)$/i);
  if (clientMatch) {
    return formatClients(await findClientsForStaff(supabase, staff.owner_id, clientMatch[1]));
  }

  const fineMatch = cmd.match(/^штрафы(?:\s+(.+))?$/i);
  if (fineMatch) {
    return formatFines(await listFines(supabase, staff.owner_id, fineMatch[1]));
  }

  const salikMatch = cmd.match(/^salik(?:\s+(.+))?$/i);
  if (salikMatch) {
    return formatSalik(await listSalik(supabase, staff.owner_id, salikMatch[1]));
  }

  const parkingMatch = cmd.match(/^парковки(?:\s+(.+))?$/i);
  if (parkingMatch) {
    return formatParking(await listParking(supabase, staff.owner_id, parkingMatch[1]));
  }

  const financeMatch = cmd.match(/^финансы\s+(наличные|ajman|сбер)\s+(\d{2})\.(\d{2})(?:\.(\d{2,4}))?\s+(.+)$/i);
  if (financeMatch) {
    const account = financeMatch[1].toLowerCase() === "наличные"
      ? "cash_aed"
      : financeMatch[1].toLowerCase() === "ajman"
        ? "ajman_aed"
        : "sber_rub";
    const yearRaw = financeMatch[4];
    const year = yearRaw ? (yearRaw.length === 2 ? "20" + yearRaw : yearRaw) : "2026";
    const date = `${year}-${financeMatch[3]}-${financeMatch[2]}`;
    const result = await callFleetDeskGateway(supabase, {
      name: "find_finance_articles",
      arguments: {
        account,
        date,
        query: financeMatch[5].trim(),
      },
      contact: { phone_number: staff.phone },
    });
    return formatFinance(result);
  }

  return "__MAIN_MENU__";
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
          const sender = String(message?.from || "");
          const messageId = String(message?.id || "");
          let text = "";

          if (message?.type === "text") {
            text = String(message?.text?.body || "").trim();
          } else if (message?.type === "interactive") {
            const listId = String(message?.interactive?.list_reply?.id || "").trim();
            const buttonId = String(message?.interactive?.button_reply?.id || "").trim();
            const selectedId = listId || buttonId;
            if (selectedId.startsWith("fd_")) text = "fd " + selectedId.slice(3);
          }

          if (!sender || !messageId) continue;

          const preSection = await getSectionChannel(supabase, phoneNumberId);

          const staff = await getActiveStaff(supabase, sender);
          if (!staff?.owner_id) {
            if (/^fd\b/i.test(text)) {
              await sendWhatsAppText(phoneNumberId, sender, "Этот номер не зарегистрирован как активный сотрудник FleetDesk.");
            }
            continue;
          }

          const conversationSection = preSection
            ? preSection.section
            : await getConversationSection(supabase, staff.owner_id, sender);

          const sectionSelection = text.match(/^fd\s+section_(cars|contracts|clients|finance|handover)$/i);
          if (!preSection && !conversationSection && !sectionSelection && !/^fd\b/i.test(text)) continue;

          const sectionChannel = preSection;
          const audit = await beginAudit(supabase, staff.owner_id, messageId, staff, sender, text);
          if (audit.duplicate) continue;

          try {
            const selectedSection = sectionSelection?.[1]?.toLowerCase() || null;
            const activeSection = sectionChannel?.section || selectedSection || conversationSection;

            const responseText = activeSection && !/^fd(?:\s+(?:меню|помощь|help|команды))?$/i.test(text)
              ? await handleSectionMessage(
                  supabase,
                  staff,
                  activeSection,
                  selectedSection ? "" : text,
                  sender,
                )
              : await handleCommand(supabase, staff, text);
            let metaResult: any;
            if (responseText === "__MAIN_MENU__") {
              metaResult = await sendWhatsAppList(
                phoneNumberId,
                sender,
                "FleetDesk",
                "Выбери раздел:",
                "Разделы",
                mainMenuRows(),
              );
            } else if (responseText === "__FINANCE_MENU__") {
              metaResult = await sendWhatsAppList(
                phoneNumberId,
                sender,
                "Финансы",
                "«Движение денег». Выбери счёт:",
                "Счета",
                financeMenuRows(),
              );
            } else if (responseText.startsWith("__FINANCE_CONFIRM__:")) {
              const draftId = responseText.split(":")[1];
              const draft = await getFinanceDraft(supabase, staff.owner_id, sender, draftId);
              if (!draft?.payload) throw new Error("Finance draft not found");
              metaResult = await sendWhatsAppButtons(
                phoneNumberId,
                sender,
                financeConfirmText(draft.payload),
                [
                  { id: `fd_finance_confirm_${draftId}`, title: "Записать" },
                  { id: `fd_finance_cancel_${draftId}`, title: "Отмена" },
                ],
              );
            } else if (responseText.startsWith("__FINANCE_PICK__:")) {
              const draftId = responseText.split(":")[1];
              const draft = await getFinanceDraft(supabase, staff.owner_id, sender, draftId);
              const candidates = Array.isArray((draft as any)?.payload?.candidates)
                ? (draft as any).payload.candidates
                : [];
              if (!candidates.length) throw new Error("Finance candidates not found");
              metaResult = await sendWhatsAppList(
                phoneNumberId,
                sender,
                "Финансы",
                "Нашёл несколько строк. Выбери нужную:",
                "Строки",
                candidates.map((candidate: any) => ({
                  id: `fd_finance_pick_${draftId}_${candidate.row}`,
                  title: truncateWhatsAppTitle(candidate.article),
                  description: truncateWhatsAppTitle(
                    candidate.section ? `${candidate.section} · строка ${candidate.row}` : `Строка ${candidate.row}`,
                    72,
                  ),
                })),
              );
            } else {
              metaResult = await sendWhatsAppText(phoneNumberId, sender, responseText);
            }
            await finishAudit(supabase, audit.id, "applied", {
              reply:
                responseText === "__MAIN_MENU__" ? "main_menu" :
                responseText === "__FINANCE_MENU__" ? "finance_menu" :
                responseText.startsWith("__FINANCE_CONFIRM__:") ? "finance_confirmation" :
                responseText.startsWith("__FINANCE_PICK__:") ? "finance_article_picker" :
                responseText,
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
