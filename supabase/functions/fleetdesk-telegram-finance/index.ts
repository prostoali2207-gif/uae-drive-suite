import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const PROJECT_URL = "https://vlcxjizieelcfunausll.supabase.co";
const FUNCTION_URL = PROJECT_URL + "/functions/v1/fleetdesk-telegram-finance";
const MINI_APP_URL = "https://uae-drive-suite.vercel.app/telegram-finance";
const FINANCE_BRIDGE_URL = "https://script.google.com/macros/s/AKfycbx-Zh3OD-aXy2rpmBFWw2mXvUUOLMn69Ndxx4lf2KDBi26FgfPRvY5UPfTMj6-49wY_uA/exec";
const GATEWAY_TOKEN_SECRET = "fleetdesk_gateway_token";
const TELEGRAM_TOKEN_SECRET = "fleetdesk_telegram_bot_token";
const SHOWROOM_BRIDGE_ENABLED = true;
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

const LEDGER_KEYS = new Set(["rental", "showroom"]);
const ACCOUNT_KEYS: Record<string, Set<string>> = {
  rental: new Set(["cash_aed", "ajman_aed", "sber_rub"]),
  showroom: new Set(["cash_aed", "ajman_aed"]),
};
const DIRECTIONS = new Map([
  ["income", "Приход"],
  ["expense", "Расход"],
]);

const SYSTEM_TRANSFER_INCOMING: Record<"rental" | "showroom", Set<string>> = {
  rental: new Set([]),
  showroom: new Set([
    "приход со счета AJMAN",
    "приход из кассы",
  ]),
};

const TRANSFER_TARGETS: Record<"rental" | "showroom", Array<{
  sourceAccount: string;
  sourceArticle: string;
  targetAccount: string;
}>> = {
  showroom: [
    { sourceAccount: "cash_aed", sourceArticle: "перевод на счет в AJMAN", targetAccount: "ajman_aed" },
    { sourceAccount: "ajman_aed", sourceArticle: "перевод в КАССУ", targetAccount: "cash_aed" },
  ],
  rental: [],
};

// Drivers spend their own cash wallet: allow every active, cash-mapped showroom expense.
// Account transfers are not expenses and must never debit a driver's wallet.
const DRIVER_NON_EXPENSE_ARTICLES = new Set([
  "перевод на счет в AJMAN",
  "перевод на счет в СБЕР",
  "перевод в КАССУ",
]);
function driverCashExpenseAllowed(item: { article: string; direction: string; rows: { cash_aed?: number | null } }) {
  return item.direction === "Расход" && Number(item.rows?.cash_aed) > 0 &&
    !DRIVER_NON_EXPENSE_ARTICLES.has(item.article);
}
const SHOWROOM_PURCHASE_ARTICLE = "покупка авто для перепродажи";
function showroomVehicleOptions(searchTerms: string) {
  const match = searchTerms.match(/\[\[vehicles:([^\]]*)\]\]/i);
  return match ? match[1].split("|").map(v => v.trim()).filter(Boolean) : [];
}
const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);
function staffIsDriver(staff: Record<string, any>) {
  return normalizeText(staff.role).toLowerCase() === "driver";
}
function staffCanManageDrivers(staff: Record<string, any>) {
  return MANAGER_ROLES.has(normalizeText(staff.role).toLowerCase());
}

const encoder = new TextEncoder();

function corsHeaders(origin: string | null) {
  const allowed = origin === "https://uae-drive-suite.vercel.app"
    ? origin
    : "https://uae-drive-suite.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function amountValue(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Сумма должна быть больше нуля.");
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function accountCurrency(account: string) {
  return account === "sber_rub" ? "RUB" : "AED";
}

function transferTarget(
  ledger: "rental" | "showroom",
  account: string,
  article: string,
) {
  return TRANSFER_TARGETS[ledger].find(
    (item) => item.sourceAccount === account && item.sourceArticle === article,
  ) || null;
}

function isSystemTransferIncoming(ledger: "rental" | "showroom", article: string) {
  return SYSTEM_TRANSFER_INCOMING[ledger].has(article);
}

function todayDubai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacSha256(key: string | Uint8Array, value: string) {
  const rawKey = typeof key === "string" ? encoder.encode(key) : key;
  const imported = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(value)));
}

function safeEqualHex(a: string, b: string) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function validateInitData(raw: string, botToken: string) {
  if (!raw) throw new Error("Открой FleetDesk из Telegram.");

  const params = new URLSearchParams(raw);
  const receivedHash = params.get("hash") || "";
  const authDate = Number(params.get("auth_date") || 0);
  const userJson = params.get("user") || "";

  if (!receivedHash || !authDate || !userJson) throw new Error("Telegram-сессия неполная.");

  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new Error("Telegram-сессия устарела. Открой приложение заново.");
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256("WebAppData", botToken);
  const calculatedHash = bytesToHex(
    await (async () => {
      const imported = await crypto.subtle.importKey(
        "raw",
        secretKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      return await crypto.subtle.sign("HMAC", imported, encoder.encode(dataCheckString));
    })(),
  );

  if (!safeEqualHex(receivedHash, calculatedHash)) throw new Error("Telegram-сессия не прошла проверку.");

  let user: Record<string, unknown>;
  try {
    user = JSON.parse(userJson);
  } catch {
    throw new Error("Некорректные данные Telegram.");
  }

  const id = Number(user.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Некорректный Telegram ID.");

  return {
    id,
    username: normalizeText(user.username) || null,
    firstName: normalizeText(user.first_name) || null,
    lastName: normalizeText(user.last_name) || null,
  };
}

async function getSecret(supabase: ReturnType<typeof createClient>, name: string) {
  const { data, error } = await supabase
    .from("service_integration_secrets")
    .select("secret_value")
    .eq("secret_name", name)
    .maybeSingle();
  if (error) throw error;
  return data?.secret_value ? String(data.secret_value) : "";
}

async function getBoundStaff(supabase: ReturnType<typeof createClient>, telegramUserId: number) {
  const { data: mapping, error: mappingError } = await supabase
    .from("staff_telegram_accounts")
    .select("staff_id, status")
    .eq("telegram_user_id", telegramUserId)
    .eq("status", "active")
    .maybeSingle();
  if (mappingError) throw mappingError;
  if (!mapping?.staff_id) return null;

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, owner_id, full_name, role, phone, status")
    .eq("id", mapping.staff_id)
    .eq("status", "active")
    .maybeSingle();
  if (staffError) throw staffError;
  return staff || null;
}

async function findStaffByPhone(supabase: ReturnType<typeof createClient>, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data: staffRows, error } = await supabase
    .from("staff")
    .select("id, owner_id, full_name, role, phone, status")
    .eq("status", "active");
  if (error) throw error;

  const direct = (staffRows || []).filter((row) => normalizePhone(row.phone) === normalized);
  if (direct.length > 1) throw new Error("Номер совпадает с несколькими сотрудниками.");
  if (direct.length === 1) return direct[0];

  const { data: alias, error: aliasError } = await supabase
    .from("staff_phone_aliases")
    .select("staff_id")
    .eq("normalized_phone", normalized)
    .eq("status", "active")
    .maybeSingle();
  if (aliasError) throw aliasError;
  if (!alias?.staff_id) return null;

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, owner_id, full_name, role, phone, status")
    .eq("id", alias.staff_id)
    .eq("status", "active")
    .maybeSingle();
  if (staffError) throw staffError;
  return staff || null;
}

async function bindTelegramStaff(
  supabase: ReturnType<typeof createClient>,
  telegramUser: { id: number; username: string | null; firstName: string | null; lastName: string | null },
  staff: Record<string, any>,
) {
  const { data: byTelegram, error: telegramError } = await supabase
    .from("staff_telegram_accounts")
    .select("staff_id")
    .eq("telegram_user_id", telegramUser.id)
    .maybeSingle();
  if (telegramError) throw telegramError;
  if (byTelegram?.staff_id && byTelegram.staff_id !== staff.id) {
    throw new Error("Этот Telegram уже привязан к другому сотруднику.");
  }

  const { data: byStaff, error: staffMapError } = await supabase
    .from("staff_telegram_accounts")
    .select("telegram_user_id")
    .eq("staff_id", staff.id)
    .maybeSingle();
  if (staffMapError) throw staffMapError;
  if (byStaff?.telegram_user_id && Number(byStaff.telegram_user_id) !== telegramUser.id) {
    throw new Error("Этот сотрудник уже привязан к другому Telegram.");
  }

  const { error } = await supabase
    .from("staff_telegram_accounts")
    .upsert({
      staff_id: staff.id,
      telegram_user_id: telegramUser.id,
      telegram_username: telegramUser.username,
      telegram_first_name: telegramUser.firstName,
      telegram_last_name: telegramUser.lastName,
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "staff_id" });
  if (error) throw error;
}

async function callBridge(
  supabase: ReturnType<typeof createClient>,
  action: string,
  payload: Record<string, unknown>,
) {
  const gatewayToken = await getSecret(supabase, GATEWAY_TOKEN_SECRET);
  if (!gatewayToken) throw new Error("Finance bridge secret is missing.");

  const response = await fetch(FINANCE_BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: gatewayToken, action, payload }),
    redirect: "follow",
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Google Sheets finance bridge returned invalid JSON.");
  }

  if (!response.ok || data?.ok !== true) {
    throw new Error(String(data?.error || "Google Sheets finance bridge request failed."));
  }
  return data;
}

function validateLedger(value: unknown) {
  const ledger = normalizeText(value || "rental").toLowerCase();
  if (!LEDGER_KEYS.has(ledger)) throw new Error("Выбери раздел финансов.");
  return ledger as "rental" | "showroom";
}

function validateAccount(value: unknown, ledger: "rental" | "showroom") {
  const account = normalizeText(value).toLowerCase();
  if (!ACCOUNT_KEYS[ledger].has(account)) throw new Error("Выбери счёт.");
  return account;
}

function validateDirection(value: unknown) {
  const key = normalizeText(value).toLowerCase();
  const label = DIRECTIONS.get(key);
  if (!label) throw new Error("Выбери Приход или Расход.");
  return { key, label };
}

function trimArticleLabel(article: string, direction: string) {
  const prefix = direction + " · ";
  return article.startsWith(prefix) ? article.slice(prefix.length) : article;
}

async function getOperationCatalog(
  supabase: ReturnType<typeof createClient>,
  ledger: "rental" | "showroom",
) {
  if (ledger === "showroom") {
    const { data, error } = await supabase
      .from("showroom_finance_operation_catalog")
      .select("sort_order, article, direction, cash_row, ajman_row, search_terms")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    return (data || [])
      .map((row: any) => ({
        reference_row: Number(row.sort_order),
        article: String(row.article || ""),
        direction: String(row.direction || ""),
        search_terms: String(row.search_terms || ""),
        rows: {
          cash_aed: row.cash_row == null ? null : Number(row.cash_row),
          ajman_aed: row.ajman_row == null ? null : Number(row.ajman_row),
          sber_rub: null,
        },
      }))
      .filter((row: any) => !isSystemTransferIncoming("showroom", row.article));
  }

  const { data, error } = await supabase
    .from("finance_operation_catalog")
    .select("reference_row, article, direction, aed_row, sber_row")
    .order("reference_row", { ascending: true });
  if (error) throw error;

  return (data || [])
    .map((row: any) => ({
      reference_row: Number(row.reference_row),
      article: String(row.article || ""),
      direction: String(row.direction || ""),
      search_terms: "",
      rows: {
        cash_aed: Number(row.aed_row),
        ajman_aed: Number(row.aed_row),
        sber_rub: Number(row.sber_row),
      },
    }))
    .filter((row: any) => !isSystemTransferIncoming("rental", row.article));
}

async function requireStaff(
  supabase: ReturnType<typeof createClient>,
  telegramUserId: number,
) {
  const staff = await getBoundStaff(supabase, telegramUserId);
  if (!staff?.owner_id) throw new Error("Сотрудник не привязан. Подтверди номер телефона.");
  return staff;
}

async function findExistingAudit(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("telegram_operation_requests")
    .select("id, status, result, payload, processed_at")
    .eq("owner_id", ownerId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}


async function showroomDriverById(db: ReturnType<typeof createClient>, ownerId: string, id: string) {
  const { data, error } = await db.from("staff").select("id, full_name, role, status")
    .eq("owner_id", ownerId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data || data.role !== "driver" || data.status !== "active") {
    throw new Error("Водитель не найден.");
  }
  return data;
}
async function driverFeatureReady(db: ReturnType<typeof createClient>) {
  try {
    const result = await callBridge(db, "get_context", { ledger: "showroom" });
    return result.driver_wallet_supported === true;
  } catch {
    return false;
  }
}
async function driverWalletData(db: ReturnType<typeof createClient>, staff: Record<string, any>) {
  const manager = staffCanManageDrivers(staff);
  const { data: allDrivers, error: driversError } = await db.from("staff")
    .select("id, full_name, role, status")
    .eq("owner_id", staff.owner_id).eq("role", "driver").eq("status", "active");
  if (driversError) throw driversError;
  const drivers = manager ? (allDrivers || []) : (allDrivers || []).filter((d: any) => d.id === staff.id);
  const entries: any[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    let query = db.from("showroom_driver_movements")
      .select("id, driver_staff_id, kind, amount, status, sheet_sync_status, article, vehicle, note, created_at, error_message")
      .eq("owner_id", staff.owner_id)
      .order("created_at", { ascending: false }).range(offset, offset + 999);
    if (!manager) query = query.eq("driver_staff_id", staff.id);
    const { data: batch, error } = await query;
    if (error) throw error;
    entries.push(...(batch || []));
    if (!batch || batch.length < 1000) break;
    if (offset >= 99000) throw new Error("История водителей слишком большая для сводки.");
  }
  const wallets = drivers.map((driver: any) => {
    const movements = entries.filter((e: any) => e.driver_staff_id === driver.id);
    const total = (kind: string) => movements.filter((e: any) => e.kind === kind && e.status === "applied")
      .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const issued = total("advance"), spent = total("expense");
    const returned = total("return"), reimbursed = total("reimbursement");
    return { staff_id: driver.id, name: driver.full_name, issued, spent, returned, reimbursed,
      balance: Math.round((issued + reimbursed - spent - returned) * 100) / 100,
      pending_sync: movements.filter((e: any) => e.status !== "cancelled" && (e.status !== "applied" || e.sheet_sync_status !== "synced")).length,
      movements: movements.slice(0, 80),
    };
  });
  return { wallets, can_manage: manager };
}
async function mirrorDriverMovement(db: ReturnType<typeof createClient>, movement: Record<string, any>) {
  const driver = await showroomDriverById(db, movement.owner_id, movement.driver_staff_id);
  try {
    const result = await callBridge(db, "record_driver_movement", {
      ledger: "showroom", driver_id: movement.driver_staff_id, driver_name: driver.full_name,
      kind: movement.kind, date: todayDubai(), amount: movement.amount,
      article: movement.article || "", vehicle: movement.vehicle || "",
      note: movement.note || "", request_id: movement.event_key,
    });
    const { error } = await db.from("showroom_driver_movements").update({
      status: "applied", sheet_sync_status: "synced", sheet_row: Number(result.input_row || 0) || null,
      error_message: null, applied_at: new Date().toISOString(),
    }).eq("id", movement.id);
    if (error) throw error;
  } catch (error) {
    await db.from("showroom_driver_movements").update({
      sheet_sync_status: "failed",
      error_message: error instanceof Error ? error.message.slice(0, 350) : "Ошибка синхронизации",
    }).eq("id", movement.id);
    throw error;
  }
}
async function driverWalletReconcile(db: ReturnType<typeof createClient>, staff: Record<string, any>) {
  if (!staffCanManageDrivers(staff)) throw new Error("Только менеджер может проверить синхронизацию.");
  if (!await driverFeatureReady(db)) throw new Error("Google Sheets ещё не подключён для водителей.");
  const { data: pending, error } = await db.from("showroom_driver_movements")
    .select("*").eq("owner_id", staff.owner_id).neq("sheet_sync_status", "synced")
    .order("created_at", { ascending: true }).limit(100);
  if (error) throw error;
  let synced = 0, waiting = 0, failed = 0;
  for (const movement of pending || []) {
    try {
      if (movement.kind === "expense") {
        if (!movement.finance_audit_id) { failed++; continue; }
        const { data: audit, error: auditError } = await db.from("telegram_operation_requests")
          .select("status").eq("owner_id", staff.owner_id)
          .eq("id", movement.finance_audit_id).maybeSingle();
        if (auditError) throw auditError;
        if (audit?.status !== "applied") { waiting++; continue; }
      }
      await mirrorDriverMovement(db, movement);
      synced++;
    } catch (reconcileError) {
      console.error("Showroom driver reconciliation failed:", reconcileError);
      failed++;
    }
  }
  return { synced, waiting, failed };
}

async function driverWalletAdjust(db: ReturnType<typeof createClient>, staff: Record<string, any>, body: Record<string, any>) {
  if (!staffCanManageDrivers(staff)) throw new Error("Только менеджер может выдавать и возвращать деньги.");
  if (!await driverFeatureReady(db)) throw new Error("Учёт водителей ещё не синхронизирован с Google Sheets.");
  const driverId = normalizeText(body.driver_staff_id);
  await showroomDriverById(db, staff.owner_id, driverId);
  const kind = normalizeText(body.kind);
  if (!["advance", "return", "reimbursement"].includes(kind)) throw new Error("Недопустимое движение денег.");
  const amount = amountValue(body.amount);
  const note = normalizeText(body.note);
  if (note.length > 500) throw new Error("Примечание слишком длинное.");
  const requestId = normalizeText(body.request_id);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error("Некорректный request_id.");
  const key = "wallet:" + staff.id + ":" + requestId;
  const { data: existing, error: lookupError } = await db.from("showroom_driver_movements")
    .select("*").eq("owner_id", staff.owner_id).eq("event_key", key).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing && (existing.kind !== kind || existing.driver_staff_id !== driverId ||
                   Number(existing.amount) !== amount || String(existing.note || "") !== note)) {
    throw new Error("Запрос с этим ID уже использован для другой операции.");
  }
  let movement = existing;
  if (!movement) {
    const current = await driverWalletData(db, staff);
    const balance = current.wallets.find((w: any) => w.staff_id === driverId)?.balance ?? 0;
    if (kind === "return" && (balance <= 0 || amount > balance + 0.001)) {
      throw new Error("Возврат не может превышать деньги на руках у водителя.");
    }
    if (kind === "reimbursement" && (balance >= 0 || amount > -balance + 0.001)) {
      throw new Error("Компенсация не может превышать долг компании водителю.");
    }
    const { data, error } = await db.from("showroom_driver_movements").insert({
      owner_id: staff.owner_id, driver_staff_id: driverId, actor_staff_id: staff.id,
      kind, amount, note, event_key: key, status: "pending", sheet_sync_status: "pending",
    }).select("*").single();
    if (error) throw error;
    movement = data;
  }
  if (movement.status !== "applied" || movement.sheet_sync_status !== "synced") {
    await mirrorDriverMovement(db, movement);
  }
  return { duplicate: Boolean(existing), status: "applied" };
}
async function ensureDriverExpense(db: ReturnType<typeof createClient>, staff: Record<string, any>, auditId: string, payload: Record<string, any>) {
  const { error } = await db.from("showroom_driver_movements").upsert({
    owner_id: staff.owner_id, driver_staff_id: staff.id, actor_staff_id: staff.id,
    kind: "expense", amount: payload.amount, event_key: "expense:" + auditId,
    finance_audit_id: auditId, article: payload.article, vehicle: payload.vehicle || "", note: payload.note,
    status: "pending", sheet_sync_status: "pending",
  }, { onConflict: "finance_audit_id" });
  if (error) throw error;
}
async function completeDriverExpense(db: ReturnType<typeof createClient>, auditId: string) {
  const { data: movement, error } = await db.from("showroom_driver_movements")
    .select("*").eq("finance_audit_id", auditId).maybeSingle();
  if (error) throw error;
  if (!movement) return;
  if (movement.status === "applied" && movement.sheet_sync_status === "synced") return;
  // The main showroom expense was already applied successfully by the finance bridge.
  const { error: updateError } = await db.from("showroom_driver_movements").update({
    status: "applied", applied_at: new Date().toISOString(),
  }).eq("id", movement.id);
  if (updateError) throw updateError;
  await mirrorDriverMovement(db, movement);
}

async function processFinanceAudit(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  telegramUserId: number,
  auditId: string,
  payload: Record<string, any>,
  requestId: string,
) {
  await supabase
    .from("telegram_operation_requests")
    .update({
      status: "received",
      result: { phase: "syncing" },
      processed_at: new Date().toISOString(),
    })
    .eq("id", auditId);

  let lastMessage = "Не удалось записать операцию.";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await callBridge(supabase, "record_entry", {
        account: payload.account,
        date: payload.date,
        article: payload.article,
        row: payload.row,
        amount: payload.amount,
        received_amount: payload.received_amount ?? null,
        note: payload.note,
        vehicle: payload.vehicle || "",
        request_id: requestId,
        ledger: payload.ledger || "rental",
      });

      result.currency = payload.account === "sber_rub" ? "RUB" : "AED";
      try {
        await completeDriverExpense(supabase, auditId);
      } catch (syncError) {
        // Main expense is already written. Keep the driver's unapplied mirror visible as failed.
        console.error("Driver movement mirror requires reconciliation:", syncError);
      }

      await supabase
        .from("telegram_operation_requests")
        .update({
          status: "applied",
          result,
          processed_at: new Date().toISOString(),
        })
        .eq("id", auditId);
      return;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Не удалось записать операцию.";
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }

  await supabase.from("showroom_driver_movements")
    .update({ status: "failed", error_message: lastMessage })
    .eq("finance_audit_id", auditId);
  await supabase
    .from("telegram_operation_requests")
    .update({
      status: "failed",
      result: { ok: false, error: lastMessage },
      processed_at: new Date().toISOString(),
    })
    .eq("id", auditId);

  try {
    await sendBotMessage(
      botToken,
      telegramUserId,
      "FleetDesk: финансовая операция не синхронизировалась с Google Sheet. Открой Финансы и повтори запись.",
    );
  } catch {
    // The audit row remains failed even if Telegram notification cannot be delivered.
  }
}

function scheduleFinanceAudit(task: Promise<void>) {
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
  } else {
    void task;
  }
}

async function recordFinance(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  telegramUser: { id: number },
  staff: Record<string, any>,
  body: Record<string, any>,
) {
  const ledger = validateLedger(body.ledger);
  if (ledger === "showroom" && !SHOWROOM_BRIDGE_ENABLED) {
    throw new Error("Автосалон ещё подключается. Прокат работает как обычно.");
  }
  const account = validateAccount(body.account, ledger);
  const direction = validateDirection(body.direction);
  const article = normalizeText(body.article);
  const row = Number(body.row);
  const amount = amountValue(body.amount);
  const note = normalizeText(body.note);
  const vehicle = normalizeText(body.vehicle);
  const requestId = normalizeText(body.request_id);
  const transfer = transferTarget(ledger, account, article);
  const receivedAmount = transfer && accountCurrency(account) !== accountCurrency(transfer.targetAccount)
    ? amountValue(body.received_amount)
    : null;

  if (!article) throw new Error("Выбери операцию.");
  if (!Number.isInteger(row) || row <= 0) throw new Error("Операция устарела. Выбери её заново.");
  if (note.length > 500) throw new Error("Примечание слишком длинное.");
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error("Некорректный request_id.");

  if (staffIsDriver(staff)) {
    if (!await driverFeatureReady(supabase)) throw new Error("Учёт водителей ещё не синхронизирован с Google Sheets.");
    if (ledger !== "showroom" || account !== "cash_aed" ||
        direction.key !== "expense" || DRIVER_NON_EXPENSE_ARTICLES.has(article)) {
      throw new Error("Водителю доступны только расходы из Кассы автосалона.");
    }
  }
  const date = todayDubai();

  let catalogMatch: any = null;
  if (ledger === "showroom") {
    const mappedField = account === "cash_aed" ? "cash_row" : "ajman_row";
    const { data, error } = await supabase
      .from("showroom_finance_operation_catalog")
      .select("sort_order, search_terms")
      .eq("active", true)
      .eq("article", article)
      .eq("direction", direction.label)
      .eq(mappedField, row)
      .maybeSingle();
    if (error) throw error;
    catalogMatch = data;
  } else {
    const mappedField = account === "sber_rub" ? "sber_row" : "aed_row";
    const { data, error } = await supabase
      .from("finance_operation_catalog")
      .select("reference_row")
      .eq("article", article)
      .eq("direction", direction.label)
      .eq(mappedField, row)
      .maybeSingle();
    if (error) throw error;
    catalogMatch = data;
  }

  if (!catalogMatch) throw new Error("Операция изменилась в справочнике. Выбери её заново.");
  if (vehicle.length > 160 || (vehicle && (ledger !== "showroom" || article !== SHOWROOM_PURCHASE_ARTICLE))) {
    throw new Error("Некорректная подкатегория автомобиля.");
  }
  if (ledger === "showroom" && article === SHOWROOM_PURCHASE_ARTICLE &&
      (staffIsDriver(staff) || vehicle)) {
    const options = showroomVehicleOptions(String(catalogMatch.search_terms || ""));
    if (!vehicle || !options.includes(vehicle) ||
        (note !== vehicle && !note.startsWith(vehicle + ": "))) {
      throw new Error("Выбери машину из списка для этой операции.");
    }
    // The bound Apps Script is deployed separately. Never record a driver's purchase
    // until its journal can persist the car in the T (subcategory) column.
    if (staffIsDriver(staff)) {
      const bridge = await callBridge(supabase, "get_context", { ledger: "showroom" });
      if (bridge.showroom_vehicle_subcategory_supported !== true) {
        throw new Error("Учёт расходов по автомобилям обновляется. Попробуй позже.");
      }
    }
  }

  const idempotencyKey = `telegram-finance:${ledger}:${telegramUser.id}:${requestId}`;
  const existing = await findExistingAudit(supabase, staff.owner_id, idempotencyKey);
  if (existing) {
    if (existing.status === "failed") {
      await supabase
        .from("telegram_operation_requests")
        .update({ status: "received", result: null, processed_at: null })
        .eq("id", existing.id);

      if (staffIsDriver(staff)) {
        await ensureDriverExpense(supabase, staff, existing.id, existing.payload || {});
      }
      scheduleFinanceAudit(
        processFinanceAudit(
          supabase,
          botToken,
          telegramUser.id,
          existing.id,
          existing.payload || {},
          requestId,
        ),
      );

      return { duplicate: true, status: "received", result: null, request_id: requestId };
    }

    return {
      duplicate: true,
      status: existing.status,
      result: existing.result,
      request_id: requestId,
    };
  }

  const payload = {
    ledger,
    account,
    direction: direction.key,
    article,
    row,
    amount,
    received_amount: receivedAmount,
    note,
    vehicle,
    date,
  };

  const { data: audit, error: auditError } = await supabase
    .from("telegram_operation_requests")
    .insert({
      owner_id: staff.owner_id,
      actor_staff_id: staff.id,
      telegram_user_id: telegramUser.id,
      idempotency_key: idempotencyKey,
      action: ledger === "showroom" ? "record_showroom_finance_entry" : "record_finance_entry",
      payload,
      status: "received",
    })
    .select("id")
    .single();

  if (auditError) {
    if ((auditError as any).code === "23505") {
      const duplicate = await findExistingAudit(supabase, staff.owner_id, idempotencyKey);
      return {
        duplicate: true,
        status: duplicate?.status || "received",
        result: duplicate?.result || null,
        request_id: requestId,
      };
    }
    throw auditError;
  }

  if (staffIsDriver(staff)) {
    try {
      await ensureDriverExpense(supabase, staff, audit.id, payload);
    } catch (error) {
      await supabase.from("telegram_operation_requests").update({
        status: "failed", result: { error: "Не удалось создать учёт водителя." },
      }).eq("id", audit.id);
      throw error;
    }
  }
  scheduleFinanceAudit(
    processFinanceAudit(
      supabase,
      botToken,
      telegramUser.id,
      audit.id,
      payload,
      requestId,
    ),
  );

  return {
    duplicate: false,
    status: "received",
    result: null,
    request_id: requestId,
  };
}


function canCorrectFinance(staff: Record<string, any>) {
  return ["owner", "manager"].includes(normalizeText(staff.role).toLowerCase());
}

function correctionTransfer(article: unknown) {
  return /^(перевод|приход из кассы|приход со счета AJMAN)/i.test(normalizeText(article));
}

function sameCorrectionValue(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keys = Object.keys(a).sort();
  return keys.length === Object.keys(b).length && keys.every(key => sameCorrectionValue(a[key], b[key]));
}

async function finishFinanceCorrection(db: ReturnType<typeof createClient>, staff: Record<string, any>, correction: any) {
  if (correction.status === "applied") return { status: "applied", correction_id: correction.id };
  try {
    const result = await callBridge(db, "correct_showroom_entry", {
      ledger: "showroom", correction_id: correction.id, version: correction.version,
      kind: correction.kind, before: correction.sheet_before, after: correction.after_payload,
      driver: correction.driver_before, actor: correction.actor_name,
    });
    const { error } = await db.rpc("showroom_finalize_finance_correction", {
      p_owner_id: staff.owner_id, p_actor_staff_id: staff.id,
      p_correction_id: correction.id, p_bridge_result: result,
    });
    if (error) throw error;
    return { status: "applied", correction_id: correction.id };
  } catch (error) {
    console.error("Showroom correction pending", correction.id, error);
    return { status: "pending", correction_id: correction.id,
      error: "Исправление ожидает синхронизации. " +
        (error instanceof Error && /вручную|черновик|сверк|справочник|не синхронизирован/.test(error.message) ?
          error.message + " Сначала устрани указанную причину в таблице, затем повтори это исправление." :
          "Повтори его из истории; новую операцию создавать не нужно.") };
  }
}

async function correctFinance(db: ReturnType<typeof createClient>, staff: Record<string, any>, body: Record<string, any>) {
  if (!canCorrectFinance(staff) || body.ledger !== "showroom") throw new Error("Операция доступна только владельцу и менеджеру автосалона.");
  if (body.action === "retry_showroom_correction") {
    const { data, error } = await db.from("showroom_finance_corrections").select("*")
      .eq("id", body.correction_id).eq("owner_id", staff.owner_id).eq("actor_staff_id", staff.id).single();
    if (error || !data) throw new Error("Операция исправления не найдена для этого сотрудника.");
    return await finishFinanceCorrection(db, staff, data);
  }
  const { data: existing, error: lookupError } = await db.from("showroom_finance_corrections").select("*")
    .eq("owner_id", staff.owner_id).eq("request_id", normalizeText(body.request_id)).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    const values = body.values || {};
    const expected = existing.after_payload;
    if (existing.actor_staff_id !== staff.id || existing.original_id !== body.audit_id ||
        existing.kind !== body.kind || existing.version !== Number(body.expected_version) + 1 ||
        !sameCorrectionValue(existing.sheet_before, body.expected_sheet) ||
        (body.kind === "edit" && (Number(values.amount) !== Number(expected.amount) ||
          normalizeText(values.article) !== expected.article || Number(values.row) !== Number(expected.row) ||
          normalizeText(values.vehicle) !== expected.vehicle || normalizeText(values.note) !== expected.note))) {
      throw new Error("Операция с этим ID уже содержит другие значения.");
    }
    return await finishFinanceCorrection(db, staff, existing);
  }
  const { data: original, error } = await db.from("telegram_operation_requests").select("*")
    .eq("id", body.audit_id).eq("owner_id", staff.owner_id).eq("action", "record_showroom_finance_entry").single();
  if (error || !original) throw new Error("Операция автосалона не найдена.");
  const before = original.payload || {};
  const values = body.values || {};
  let after = before;
  if (body.kind === "edit") {
    const note = normalizeText(values.note), vehicle = normalizeText(values.vehicle);
    if (note.length > 500 || vehicle.length > 160 || /^=/.test(note) || /^[=+@]/.test(vehicle) ||
        !Number.isFinite(Number(values.amount)) || Number(values.amount) <= 0) {
      return { status: "rejected", correction_rejected: true, applied: false,
        error: "Сумма, примечание или авто/объект содержит недопустимое значение." };
    }
    const article = normalizeText(values.article);
    const sheetNote = article === "покупка авто для перепродажи" ? [vehicle, note].filter(Boolean).join(" · ") : note;
    after = { ...before, amount: amountValue(values.amount), article,
      row: Number(values.row), vehicle, note, sheet_note: sheetNote };
  }
  if (correctionTransfer(before.article) || correctionTransfer(after.article)) return {
    status: "rejected", correction_rejected: true, applied: false,
    error: "Операция перевода защищена: необходимо сохранить обе парные записи." };
  const snapshot = body.expected_sheet;
  if (!snapshot || snapshot.request_id !== original.result?.request_id) return {
    status: "rejected", correction_rejected: true, applied: false,
    error: "Операция не сверена с Google Sheets. Обнови историю." };
  const inspection = await callBridge(db, "inspect_showroom_entries", { ledger: "showroom",
    entries: [{ audit_id: original.id, request_id: original.result.request_id }] });
  const current = inspection.entries?.[0];
  if (!current?.snapshot || !sameCorrectionValue(current.snapshot, snapshot)) {
    return { status: "rejected", correction_rejected: true, applied: false,
      error: current?.error || "Операция изменилась в Google Sheets. Обнови историю и сверь значения." };
  }
  const { data, error: beginError } = await db.rpc("showroom_begin_finance_correction", {
    p_owner_id: staff.owner_id, p_actor_staff_id: staff.id, p_original_id: original.id,
    p_request_id: body.request_id, p_expected_version: body.expected_version,
    p_kind: body.kind, p_after_payload: after, p_sheet_before: snapshot,
  });
  if (beginError) {
    // Only an explicit PostgreSQL rejection proves that the transaction did not commit.
    if (beginError.code === "P0001" || beginError.code === "23514" || beginError.code === "22P02") {
      return { status: "rejected", correction_rejected: true, applied: false,
        error: "Операция не может быть исправлена: " + beginError.message };
    }
    throw new Error("Операция исправления не подтверждена. Повтори тот же запрос.");
  }
  return await finishFinanceCorrection(db, staff, data);
}

async function getFinanceHistory(
  supabase: ReturnType<typeof createClient>,
  telegramUser: { id: number },
  staff: Record<string, any>,
  body: Record<string, any>,
) {
  const ledger = validateLedger(body.ledger);
  const rawLimit = Number(body.limit || 60);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 60, 1), 100);
  const action = ledger === "showroom" ? "record_showroom_finance_entry" : "record_finance_entry";

  let query = supabase
    .from("telegram_operation_requests")
    .select("id, actor_staff_id, telegram_user_id, created_at, processed_at, payload, result")
    .eq("owner_id", staff.owner_id)
    .eq("status", "applied")
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(limit);

  const role = normalizeText(staff.role).toLowerCase();
  const canViewTeamHistory = ["owner", "admin", "manager"].includes(role);
  if (!canViewTeamHistory) query = query.eq("telegram_user_id", telegramUser.id);

  const { data: rows, error } = await query;
  if (error) throw error;

  const staffIds = Array.from(new Set(
    (rows || []).map((row: any) => String(row.actor_staff_id || "")).filter(Boolean),
  ));

  const names = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows, error: staffError } = await supabase
      .from("staff")
      .select("id, full_name")
      .in("id", staffIds);
    if (staffError) throw staffError;
    for (const row of staffRows || []) {
      names.set(String(row.id), normalizeText(row.full_name));
    }
  }

  const items = (rows || []).map((row: any) => {
    const payload = row.payload || {};
    const result = row.result || {};
    const account = normalizeText(payload.account || result.account);
    const direction = normalizeText(payload.direction) === "income" || result.type === "Приход"
      ? "income"
      : "expense";
    const amount = Number(payload.amount ?? result.amount);
    const article = normalizeText(payload.article || result.article);
    const label = trimArticleLabel(article, direction === "income" ? "Приход" : "Расход");

    return {
      id: String(row.id),
      ledger,
      account,
      account_label: normalizeText(result.account_label) || (
        account === "cash_aed" ? "Касса" :
        account === "ajman_aed" ? "AJMAN" :
        account === "sber_rub" ? "СБЕР" : account
      ),
      direction,
      article,
      label: label || article,
      amount,
      currency: normalizeText(result.currency) || (account === "sber_rub" ? "RUB" : "AED"),
      note: normalizeText(ledger === "showroom" ? payload.note ?? result.note : payload.note || result.note),
      date: normalizeText(payload.date || result.date),
      created_at: row.created_at,
      actor_name: names.get(String(row.actor_staff_id || "")) || "Сотрудник",
    };
  }).filter((item: any) => item.article && Number.isFinite(item.amount) && item.amount > 0);

  if (ledger === "showroom") {
    const ids = items.map((item: any) => item.id);
    const { data: corrections, error: correctionError } = ids.length ? await supabase
      .from("showroom_finance_corrections").select("id,original_id,request_id,kind,after_payload,actor_staff_id,status")
      .eq("owner_id", staff.owner_id).eq("status", "pending").in("original_id", ids) : { data: [], error: null };
    let snapshots: any[] = [];
    try {
      if (canCorrectFinance(staff) && !correctionError && ids.length) {
        const inspection = await callBridge(supabase, "inspect_showroom_entries", { ledger,
          entries: (rows || []).map((row: any) => ({ audit_id: row.id, request_id: row.result?.request_id })) });
        snapshots = inspection.entries || [];
      }
    } catch (_) { /* History remains readable when Sheets is unavailable; corrections fail closed. */ }
    return { ledger, items: items.map((item: any) => {
      const original: any = (rows || []).find((row: any) => row.id === item.id);
      const result = original.result || {}, payload = original.payload || {};
      const pending = corrections?.find((row: any) => row.original_id === item.id);
      const inspected = snapshots.find((row: any) => row.audit_id === item.id);
      const snapshot = inspected?.snapshot;
      const blocked = result.cancelled ? "Запись отменена." : correctionTransfer(item.article) || result.transfer_pair || result.transfer ?
        "Перевод нельзя менять отдельно: необходимо сохранить обе парные записи." : pending ?
        "Исправление ожидает синхронизации." : !snapshot || snapshot.pending || snapshot.version !== Number(result.correction_version || 0) ?
        inspected?.error || "Нет подтверждённой сверки с Google Sheets. Обнови историю." : "";
      return { ...item, version: Number(result.correction_version || 0), cancelled: Boolean(result.cancelled),
        vehicle: payload.vehicle ?? (snapshot?.vehicle || (item.article === "покупка авто для перепродажи" ? payload.note : "")) ?? "",
        note: payload.vehicle === undefined && item.article === "покупка авто для перепродажи" ? "" : item.note,
        can_correct: canCorrectFinance(staff) && !blocked,
        correction_block_reason: blocked, sheet_snapshot: snapshot || null,
        pending_correction: pending?.actor_staff_id === staff.id ? pending : null,
        correction_actor_name: result.corrected_by || null, corrected_at: result.corrected_at || null };
    }) };
  }
  return { ledger, items };
}

async function telegramApi(botToken: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null) as any;
  if (!response.ok || data?.ok !== true) {
    throw new Error(String(data?.description || `Telegram ${method} failed.`));
  }
  return data.result;
}

async function sendBotMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  return await telegramApi(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

async function handleTelegramUpdate(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  body: Record<string, any>,
) {
  const message = body?.message;
  const from = message?.from;
  const chat = message?.chat;
  if (!message || !from?.id || chat?.type !== "private") return { ok: true };

  const telegramUser = {
    id: Number(from.id),
    username: normalizeText(from.username) || null,
    firstName: normalizeText(from.first_name) || null,
    lastName: normalizeText(from.last_name) || null,
  };

  const contact = message.contact;
  if (contact) {
    if (Number(contact.user_id || 0) !== telegramUser.id) {
      await sendBotMessage(botToken, chat.id, "Нужно отправить именно свой номер Telegram.");
      return { ok: true };
    }

    try {
      const staff = await findStaffByPhone(supabase, contact.phone_number);
      if (!staff) {
        await sendBotMessage(botToken, chat.id, "Этот номер не найден среди активных сотрудников FleetDesk.");
        return { ok: true };
      }

      await bindTelegramStaff(supabase, telegramUser, staff);
      await sendBotMessage(
        botToken,
        chat.id,
        `Готово. Telegram привязан к сотруднику: ${staff.full_name}.`,
        {
          inline_keyboard: [[{
            text: "Открыть Финансы",
            web_app: { url: MINI_APP_URL },
          }]],
        },
      );
    } catch (error) {
      await sendBotMessage(
        botToken,
        chat.id,
        error instanceof Error ? error.message : "Не удалось привязать сотрудника.",
      );
    }
    return { ok: true };
  }

  const text = normalizeText(message.text);
  if (text === "/start" || text.startsWith("/start ")) {
    const staff = await getBoundStaff(supabase, telegramUser.id);
    if (staff) {
      await sendBotMessage(
        botToken,
        chat.id,
        `FleetDesk · ${staff.full_name}`,
        {
          inline_keyboard: [[{
            text: "Открыть Финансы",
            web_app: { url: MINI_APP_URL },
          }]],
        },
      );
    } else {
      await sendBotMessage(
        botToken,
        chat.id,
        "Подтверди свой номер Telegram. Он нужен только чтобы связать тебя с сотрудником FleetDesk.",
        {
          keyboard: [[{ text: "Подтвердить номер", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      );
    }
  }

  return { ok: true };
}

async function configureBot(botToken: string) {
  const webhookSecret = await sha256Hex("fleetdesk-telegram-hook:" + botToken);
  const me = await telegramApi(botToken, "getMe", {});
  await telegramApi(botToken, "setWebhook", {
    url: FUNCTION_URL,
    secret_token: webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  await telegramApi(botToken, "setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "FleetDesk",
      web_app: { url: MINI_APP_URL },
    },
  });
  await telegramApi(botToken, "setMyCommands", {
    commands: [{ command: "start", description: "Открыть FleetDesk" }],
  });
  return { username: me?.username || null, id: me?.id || null };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ ok: false, error: "Service configuration is incomplete." }, 500, origin);

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const botToken = await getSecret(supabase, TELEGRAM_TOKEN_SECRET);
    const gatewayToken = await getSecret(supabase, GATEWAY_TOKEN_SECRET);

    if (req.method === "GET") {
      if (new URL(req.url).searchParams.get("configure") === "1") {
        if (!botToken) return json({ ok: false, error: "Telegram bot token is not configured." }, 503, origin);
        const bot = await configureBot(botToken);
        return json({ ok: true, configured: true, bot, mini_app_url: MINI_APP_URL }, 200, origin);
      }
      return json({
        ok: true,
        service: "fleetdesk-telegram-finance",
        telegram_ready: Boolean(botToken),
        finance_bridge_ready: Boolean(gatewayToken),
        mini_app_url: MINI_APP_URL,
      }, 200, origin);
    }

    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405, origin);
    if (!botToken) return json({ ok: false, code: "telegram_setup_required", error: "Telegram bot token is not configured." }, 503, origin);

    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const webhookHeader = req.headers.get("x-telegram-bot-api-secret-token");

    if (webhookHeader) {
      const expected = await sha256Hex("fleetdesk-telegram-hook:" + botToken);
      if (!safeEqualHex(webhookHeader, expected)) return json({ ok: false, error: "Unauthorized." }, 401, origin);
      return json(await handleTelegramUpdate(supabase, botToken, body), 200, origin);
    }

    const action = normalizeText(body.action);
    const telegramUser = await validateInitData(normalizeText(body.initData), botToken);

    if (action === "session") {
      const staff = await getBoundStaff(supabase, telegramUser.id);
      if (!staff) {
        return json({
          ok: true,
          bound: false,
          telegram_user: { id: telegramUser.id, first_name: telegramUser.firstName },
        }, 200, origin);
      }
      const driver = staffIsDriver(staff);
      const walletReady = await driverFeatureReady(supabase);
      const [catalog, showroomCatalog] = await Promise.all([
        driver ? Promise.resolve([]) : getOperationCatalog(supabase, "rental"),
        getOperationCatalog(supabase, "showroom"),
      ]);
      return json({
        ok: true,
        bound: true,
        staff: { id: staff.id, full_name: staff.full_name, role: staff.role },
        driver_wallet_ready: walletReady,
        catalog,
        catalogs: {
          rental: catalog,
          showroom: driver ? showroomCatalog.filter(driverCashExpenseAllowed) : showroomCatalog,
        },
      }, 200, origin);
    }

    const staff = await requireStaff(supabase, telegramUser.id);

    if (action === "correct_showroom_finance" || action === "retry_showroom_correction") {
      return json({ ok: true, ...await correctFinance(supabase, staff, body) }, 200, origin);
    }

    if (action === "wallet") {
      return json({ ok: true, ...await driverWalletData(supabase, staff) }, 200, origin);
    }
    if (action === "wallet_adjust") {
      return json({ ok: true, ...await driverWalletAdjust(supabase, staff, body) }, 200, origin);
    }
    if (action === "wallet_reconcile") {
      return json({ ok: true, ...await driverWalletReconcile(supabase, staff) }, 200, origin);
    }
    if (action === "history") {
      if (staffIsDriver(staff) && validateLedger(body.ledger) !== "showroom") {
        throw new Error("Водителю доступен только автосалон.");
      }
      const history = await getFinanceHistory(supabase, telegramUser, staff, body);
      return json({ ok: true, ...history }, 200, origin);
    }

    if (action === "search") {
      const ledger = validateLedger(body.ledger);
      const account = validateAccount(body.account, ledger);
      const direction = validateDirection(body.direction);
      const query = normalizeText(body.query);
      if (staffIsDriver(staff) && (ledger !== "showroom" || account !== "cash_aed" || direction.key !== "expense")) {
        throw new Error("Водителю доступны только расходы автосалона.");
      }
      if (!query) return json({ ok: true, matches: [], alternate: null }, 200, origin);
      if (query.length > 120) throw new Error("Поиск слишком длинный.");

      const result = await callBridge(supabase, "find_articles", {
        account,
        date: todayDubai(),
        query,
        direction: direction.label,
        ledger,
      });

      const matches = (Array.isArray(result.matches) ? result.matches : [])
        .filter((item: any) => String(item.section || "") === direction.label)
        .filter((item: any) => !isSystemTransferIncoming(ledger, String(item.article || "")))
        .filter((item: any) => !staffIsDriver(staff) ||
          !DRIVER_NON_EXPENSE_ARTICLES.has(String(item.article || "")))
        .slice(0, 12)
        .map((item: any) => ({
          row: Number(item.row),
          article: String(item.article || ""),
          label: trimArticleLabel(String(item.article || ""), direction.label),
        }));

      let alternate = null;
      if (matches.length === 0 && !staffIsDriver(staff)) {
        const alternateKey = direction.key === "income" ? "expense" : "income";
        const alternateLabel = DIRECTIONS.get(alternateKey)!;
        const alternateResult = await callBridge(supabase, "find_articles", {
          account,
          date: todayDubai(),
          query,
          direction: alternateLabel,
          ledger,
        });

        const alternateMatches = (Array.isArray(alternateResult.matches) ? alternateResult.matches : [])
          .filter((item: any) => String(item.section || "") === alternateLabel)
          .filter((item: any) => !isSystemTransferIncoming(ledger, String(item.article || "")))
          .slice(0, 5)
          .map((item: any) => ({
            row: Number(item.row),
            article: String(item.article || ""),
            label: trimArticleLabel(String(item.article || ""), alternateLabel),
          }));

        if (alternateMatches.length > 0) {
          alternate = {
            direction: alternateKey,
            direction_label: alternateLabel,
            matches: alternateMatches,
          };
        }
      }

      return json({ ok: true, matches, alternate }, 200, origin);
    }

    if (action === "record") {
      const result = await recordFinance(supabase, botToken, telegramUser, staff, body);
      return json({ ok: true, ...result }, 200, origin);
    }

    if (action === "status") {
      const requestId = normalizeText(body.request_id);
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) {
        throw new Error("Некорректный request_id.");
      }

      const ledger = validateLedger(body.ledger);
      const idempotencyKey = `telegram-finance:${ledger}:${telegramUser.id}:${requestId}`;
      const current = await findExistingAudit(supabase, staff.owner_id, idempotencyKey);
      if (!current) {
        return json({ ok: false, error: "Операция не найдена." }, 404, origin);
      }

      return json({
        ok: true,
        status: current.status,
        result: current.result,
        request_id: requestId,
      }, 200, origin);
    }

    return json({ ok: false, error: "Unsupported action." }, 400, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const userError =
      message.includes("Выбери") ||
      message.includes("Открой") ||
      message.includes("Telegram-сессия") ||
      message.includes("привязан") ||
      message.includes("Сотрудник") ||
      message.includes("Операция") ||
      message.includes("Сумма") ||
      message.includes("Примечание") ||
      message.includes("справочник") ||
      message.includes("таблиц") ||
      message.includes("Дата");
    if (!userError) console.error(error);
    return json({ ok: false, error: userError ? message : "Не удалось выполнить операцию." }, userError ? 400 : 500, origin);
  }
});
