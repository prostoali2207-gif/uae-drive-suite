import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const PEACH_TOKEN_SHA256 = 'a837eb5861426d57f2b47398aac8f43dc3852a4d74651aecfb0ccb6ccb73dc6f';
const RENTAL_BACKEND_URL = 'https://vlcxjizieelcfunausll.supabase.co/functions/v1/fleetdesk-whatsapp-operations';
const FINANCE_BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbx-Zh3OD-aXy2rpmBFWw2mXvUUOLMn69Ndxx4lf2KDBi26FgfPRvY5UPfTMj6-49wY_uA/exec';
const FINANCE_TOOL_NAMES = new Set(['find_finance_articles', 'record_finance_entry']);
const FINANCE_ACCOUNTS = new Set(['cash_aed', 'ajman_aed', 'sber_rub']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Peach-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function authorize(req: Request) {
  const token = req.headers.get('x-peach-token') || '';
  return Boolean(token) && (await sha256Hex(token)) === PEACH_TOKEN_SHA256;
}

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function isDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function roundMoney(value: unknown) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return '{' + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ':' + stableJson(obj[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function buildIdempotencyKey(contact: Record<string, unknown>, name: string, args: Record<string, unknown>) {
  const contactKey = String(contact.id || normalizePhone(contact.phone_number) || 'unknown');
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const digest = await sha256Hex(stableJson({ contactKey, name, args, bucket }));
  return `peach-tool:${name}:${digest.slice(0, 40)}`;
}

async function getActiveStaff(supabase: ReturnType<typeof createClient>, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id, owner_id, full_name, role, phone, status')
    .eq('status', 'active');
  if (staffError) throw staffError;

  const directMatches = (staffRows || []).filter((row) => normalizePhone(row.phone) === normalized);
  if (directMatches.length > 1) throw new Error('Phone number matches more than one active FleetDesk staff account.');
  if (directMatches.length === 1) return directMatches[0];

  const { data: alias, error: aliasError } = await supabase
    .from('staff_phone_aliases')
    .select('staff_id')
    .eq('normalized_phone', normalized)
    .eq('status', 'active')
    .maybeSingle();
  if (aliasError) throw aliasError;
  if (!alias?.staff_id) return null;

  const { data: staff, error: aliasStaffError } = await supabase
    .from('staff')
    .select('id, owner_id, full_name, role, phone, status')
    .eq('id', alias.staff_id)
    .eq('status', 'active')
    .maybeSingle();
  if (aliasStaffError) throw aliasStaffError;
  return staff || null;
}

async function findAudit(supabase: ReturnType<typeof createClient>, ownerId: string, idempotencyKey: string) {
  const { data, error } = await supabase
    .from('whatsapp_operation_requests')
    .select('id, status, result, action')
    .eq('owner_id', ownerId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createAudit(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  idempotencyKey: string,
  staff: Record<string, any>,
  actorPhone: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from('whatsapp_operation_requests')
    .insert({
      owner_id: ownerId,
      idempotency_key: idempotencyKey,
      actor_phone: actorPhone,
      actor_type: 'staff',
      actor_staff_id: staff.id,
      actor_client_id: null,
      action: 'record_finance_entry',
      contract_id: null,
      payload,
      status: 'received',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function finishAudit(
  supabase: ReturnType<typeof createClient>,
  auditId: string,
  status: 'applied' | 'failed',
  result: unknown,
) {
  const { error } = await supabase
    .from('whatsapp_operation_requests')
    .update({ status, result, processed_at: new Date().toISOString() })
    .eq('id', auditId);
  if (error) throw error;
}

function validateFinanceArgs(name: string, args: Record<string, unknown>) {
  const account = String(args.account || '').trim().toLowerCase();
  if (!FINANCE_ACCOUNTS.has(account)) {
    throw new Error('account must be cash_aed, ajman_aed, or sber_rub.');
  }

  const date = String(args.date || '').trim();
  if (!isDate(date)) throw new Error('date must be YYYY-MM-DD.');

  if (name === 'find_finance_articles') {
    if (!String(args.query || '').trim()) throw new Error('query is required.');
    return;
  }

  const article = String(args.article || '').trim();
  const amount = roundMoney(args.amount);
  if (!article) throw new Error('article is required.');
  if (!(amount > 0)) throw new Error('amount must be greater than zero.');
  if (args.row !== undefined && args.row !== null && args.row !== '' && !Number.isInteger(Number(args.row))) {
    throw new Error('row must be an integer.');
  }
}

async function callFinanceBridge(peachToken: string, action: string, payload: Record<string, unknown>) {
  const response = await fetch(FINANCE_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: peachToken, action, payload }),
    redirect: 'follow',
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Google Sheets finance bridge returned an invalid response.');
  }

  if (!response.ok || !data || data.ok !== true) {
    throw new Error(String(data?.error || 'Google Sheets finance bridge request failed.'));
  }
  return data;
}

const financeDeclarations = [
  {
    name: 'find_finance_articles',
    description: 'STAFF ONLY. Search the Google Sheet bookkeeping block for the exact article/subrow before recording an entry. Use when the correct row is unclear or the same vehicle/article appears in multiple sections.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', enum: ['cash_aed', 'ajman_aed', 'sber_rub'], description: 'Bookkeeping account: cash AED, AJMAN AED, or SBER RUB.' },
        date: { type: 'string', description: 'Transaction date in YYYY-MM-DD.' },
        query: { type: 'string', description: 'Part of an article name, category, or vehicle plate.' },
      },
      required: ['account', 'date', 'query'],
    },
  },
  {
    name: 'record_finance_entry',
    description: 'STAFF ONLY. Record one confirmed bookkeeping amount in the existing Google Sheet. Never write automatic parent/formula rows. Never overwrite existing data. Only cash AED, AJMAN AED, and SBER RUB are allowed.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', enum: ['cash_aed', 'ajman_aed', 'sber_rub'], description: 'Bookkeeping account.' },
        date: { type: 'string', description: 'Transaction date in YYYY-MM-DD.' },
        article: { type: 'string', description: 'Exact article/subrow name from the sheet.' },
        row: { type: 'number', description: 'Exact row returned by find_finance_articles when duplicate article names exist.' },
        amount: { type: 'number', description: 'Positive amount in the account currency.' },
        note: { type: 'string', description: 'Optional short note such as client name, plate, or description.' },
      },
      required: ['account', 'date', 'article', 'amount'],
    },
  },
];

async function getCombinedDeclarations(peachToken: string) {
  const upstream = await fetch(RENTAL_BACKEND_URL, {
    method: 'GET',
    headers: { 'X-Peach-Token': peachToken },
  });
  const text = await upstream.text();
  if (!upstream.ok) throw new Error(`Rental backend declaration request failed (${upstream.status}).`);

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Rental backend returned invalid tool declarations.');
  }

  const existing = Array.isArray(data?.function_declarations) ? data.function_declarations : [];
  return { function_declarations: [...existing, ...financeDeclarations] };
}

async function forwardRentalRequest(peachToken: string, body: unknown) {
  const upstream = await fetch(RENTAL_BACKEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Peach-Token': peachToken,
    },
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders, 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

async function canonicalizeStaffAlias(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, any>,
) {
  const contact = body.contact && typeof body.contact === 'object' ? body.contact : null;
  const actorPhone = String(contact?.phone_number || '').trim();
  if (!actorPhone) return body;

  const staff = await getActiveStaff(supabase, actorPhone);
  if (!staff?.phone || normalizePhone(staff.phone) === normalizePhone(actorPhone)) return body;

  return {
    ...body,
    contact: {
      ...contact,
      phone_number: staff.phone,
      original_phone_number: actorPhone,
    },
  };
}

async function handleFinanceTool(
  supabase: ReturnType<typeof createClient>,
  peachToken: string,
  body: Record<string, any>,
) {
  const name = String(body.name || '').trim();
  const args = body.arguments && typeof body.arguments === 'object' ? body.arguments : {};
  const contact = body.contact && typeof body.contact === 'object' ? body.contact : {};
  const actorPhone = String(contact.phone_number || '').trim();

  if (!actorPhone) return json({ error: 'Peach contact phone_number is required.' }, 400);
  validateFinanceArgs(name, args);

  const staff = await getActiveStaff(supabase, actorPhone);
  if (!staff?.owner_id) return json({ error: 'Only active FleetDesk staff can use finance tools.' }, 403);

  if (name === 'find_finance_articles') {
    const result = await callFinanceBridge(peachToken, 'find_articles', {
      account: String(args.account).trim().toLowerCase(),
      date: String(args.date).trim(),
      query: String(args.query).trim(),
    });
    return json(result);
  }

  const payload = {
    account: String(args.account).trim().toLowerCase(),
    date: String(args.date).trim(),
    article: String(args.article).trim(),
    row: args.row === undefined || args.row === null ? null : Number(args.row),
    amount: roundMoney(args.amount),
    note: args.note ? String(args.note).trim() : '',
  };

  const idempotencyKey = await buildIdempotencyKey(contact, name, args);
  const existing = await findAudit(supabase, staff.owner_id, idempotencyKey);
  if (existing) {
    return json({
      duplicate: true,
      status: existing.status,
      action: existing.action,
      result: existing.result,
    });
  }

  const auditId = await createAudit(
    supabase,
    staff.owner_id,
    idempotencyKey,
    staff,
    actorPhone,
    payload,
  );

  try {
    const result = await callFinanceBridge(peachToken, 'record_entry', payload);
    await finishAudit(supabase, auditId, 'applied', result);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    await finishAudit(supabase, auditId, 'failed', { ok: false, error: message });
    return json({ error: message }, 400);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  if (!(await authorize(req))) return json({ error: 'Unauthorized' }, 401);

  const peachToken = req.headers.get('x-peach-token') || '';

  try {
    if (req.method === 'GET') return json(await getCombinedDeclarations(peachToken));

    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const name = String(body?.name || '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!FINANCE_TOOL_NAMES.has(name)) {
      if (!supabaseUrl || !serviceRole) return await forwardRentalRequest(peachToken, body);
      const supabase = createClient(supabaseUrl, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const forwardedBody = await canonicalizeStaffAlias(supabase, body);
      return await forwardRentalRequest(peachToken, forwardedBody);
    }

    if (!supabaseUrl || !serviceRole) return json({ error: 'FleetDesk service configuration is incomplete.' }, 500);

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return await handleFinanceTool(supabase, peachToken, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const isUserError =
      message.includes('required') ||
      message.includes('must be') ||
      message.includes('Only active') ||
      message.includes('already contains') ||
      message.includes('formula row') ||
      message.includes('not found') ||
      message.includes('More than one');
    if (!isUserError) console.error(error);
    return json({ error: isUserError ? message : 'Unexpected server error' }, isUserError ? 400 : 500);
  }
});
