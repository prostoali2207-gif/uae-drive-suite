import { createClient } from '@supabase/supabase-js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

export function authorize(req, res) {
  const expected = requiredEnv('FLEETDESK_GPT_API_KEY');
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${expected}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function getOwnerId() {
  return requiredEnv('FLEETDESK_GPT_OWNER_ID');
}

export function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url) throw new Error('Missing server environment variable: SUPABASE_URL');

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function parseLimit(value, fallback = 10, max = 25) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function toDateTime(date, time, endOfDay = false) {
  const safeTime = time || (endOfDay ? '23:59:59' : '00:00:00');
  return new Date(`${date}T${safeTime}`);
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function handleError(res, error) {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json({ error: message });
}
