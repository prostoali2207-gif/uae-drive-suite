import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const PROJECT_URL = "https://vlcxjizieelcfunausll.supabase.co";
const FUNCTION_URL = PROJECT_URL + "/functions/v1/fleetdesk-telegram-finance";
const MINI_APP_URL = "https://uae-drive-suite.vercel.app/telegram-finance";
const FINANCE_BRIDGE_URL = "https://script.google.com/macros/s/AKfycbx-Zh3OD-aXy2rpmBFWw2mXvUUOLMn69Ndxx4lf2KDBi26FgfPRvY5UPfTMj6-49wY_uA/exec";
const GATEWAY_TOKEN_SECRET = "fleetdesk_gateway_token";
const TELEGRAM_TOKEN_SECRET = "fleetdesk_telegram_bot_token";
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

const ACCOUNT_KEYS = new Set(["cash_aed", "ajman_aed", "sber_rub"]);
const DIRECTIONS = new Map([
  ["income", "Приход"],
  ["expense", "Расход"],
]);

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

function validateAccount(value: unknown) {
  const account = normalizeText(value).toLowerCase();
  if (!ACCOUNT_KEYS.has(account)) throw new Error("Выбери счёт.");
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

async function getOperationCatalog(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("finance_operation_catalog")
    .select("reference_row, article, direction, aed_row, sber_row")
    .order("reference_row", { ascending: true });
  if (error) throw error;
  return data || [];
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
    .select("status, result")
    .eq("owner_id", ownerId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function recordFinance(
  supabase: ReturnType<typeof createClient>,
  telegramUser: { id: number },
  staff: Record<string, any>,
  body: Record<string, any>,
) {
  const account = validateAccount(body.account);
  const direction = validateDirection(body.direction);
  const article = normalizeText(body.article);
  const row = Number(body.row);
  const amount = amountValue(body.amount);
  const note = normalizeText(body.note);
  const requestId = normalizeText(body.request_id);

  if (!article) throw new Error("Выбери операцию.");
  if (!Number.isInteger(row) || row <= 0) throw new Error("Операция устарела. Выбери её заново.");
  if (note.length > 500) throw new Error("Примечание слишком длинное.");
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error("Некорректный request_id.");

  const date = todayDubai();

  const mappedField = account === "sber_rub" ? "sber_row" : "aed_row";
  const { data: catalogMatch, error: catalogError } = await supabase
    .from("finance_operation_catalog")
    .select("reference_row")
    .eq("article", article)
    .eq("direction", direction.label)
    .eq(mappedField, row)
    .maybeSingle();

  if (catalogError) throw catalogError;
  if (!catalogMatch) throw new Error("Операция изменилась в справочнике. Выбери её заново.");

  const idempotencyKey = `telegram-finance:${telegramUser.id}:${requestId}`;
  const existing = await findExistingAudit(supabase, staff.owner_id, idempotencyKey);
  if (existing) {
    return {
      duplicate: true,
      status: existing.status,
      result: existing.result,
    };
  }

  const payload = {
    account,
    direction: direction.key,
    article,
    row,
    amount,
    note,
    date,
  };

  const { data: audit, error: auditError } = await supabase
    .from("telegram_operation_requests")
    .insert({
      owner_id: staff.owner_id,
      actor_staff_id: staff.id,
      telegram_user_id: telegramUser.id,
      idempotency_key: idempotencyKey,
      action: "record_finance_entry",
      payload,
      status: "received",
    })
    .select("id")
    .single();

  if (auditError) {
    if ((auditError as any).code === "23505") {
      const duplicate = await findExistingAudit(supabase, staff.owner_id, idempotencyKey);
      return { duplicate: true, status: duplicate?.status || "received", result: duplicate?.result || null };
    }
    throw auditError;
  }

  try {
    const result = await callBridge(supabase, "record_entry", {
      account,
      date,
      article,
      row,
      amount,
      note,
    });

    result.currency = account === "sber_rub" ? "RUB" : "AED";

    await supabase
      .from("telegram_operation_requests")
      .update({ status: "applied", result, processed_at: new Date().toISOString() })
      .eq("id", audit.id);

    return { duplicate: false, status: "applied", result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось записать операцию.";
    await supabase
      .from("telegram_operation_requests")
      .update({
        status: "failed",
        result: { ok: false, error: message },
        processed_at: new Date().toISOString(),
      })
      .eq("id", audit.id);
    throw new Error(message);
  }
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
      const catalog = await getOperationCatalog(supabase);
      return json({
        ok: true,
        bound: true,
        staff: { id: staff.id, full_name: staff.full_name, role: staff.role },
        catalog,
      }, 200, origin);
    }

    const staff = await requireStaff(supabase, telegramUser.id);

    if (action === "search") {
      const account = validateAccount(body.account);
      const direction = validateDirection(body.direction);
      const query = normalizeText(body.query);
      if (!query) return json({ ok: true, matches: [], alternate: null }, 200, origin);
      if (query.length > 120) throw new Error("Поиск слишком длинный.");

      const result = await callBridge(supabase, "find_articles", {
        account,
        date: todayDubai(),
        query,
        direction: direction.label,
      });

      const matches = (Array.isArray(result.matches) ? result.matches : [])
        .filter((item: any) => String(item.section || "") === direction.label)
        .slice(0, 12)
        .map((item: any) => ({
          row: Number(item.row),
          article: String(item.article || ""),
          label: trimArticleLabel(String(item.article || ""), direction.label),
        }));

      let alternate = null;
      if (matches.length === 0) {
        const alternateKey = direction.key === "income" ? "expense" : "income";
        const alternateLabel = DIRECTIONS.get(alternateKey)!;
        const alternateResult = await callBridge(supabase, "find_articles", {
          account,
          date: todayDubai(),
          query,
          direction: alternateLabel,
        });

        const alternateMatches = (Array.isArray(alternateResult.matches) ? alternateResult.matches : [])
          .filter((item: any) => String(item.section || "") === alternateLabel)
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
      const result = await recordFinance(supabase, telegramUser, staff, body);
      return json({ ok: true, ...result }, 200, origin);
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
