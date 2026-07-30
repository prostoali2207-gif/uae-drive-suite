import {
  authorize,
  getAdminClient,
  getOwnerId,
  handleError,
  parseLimit,
  setCors,
} from '../_lib/fleetdesk.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!authorize(req, res)) return;

    const supabase = getAdminClient();
    const ownerId = getOwnerId();
    const limit = parseLimit(req.query.limit);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();

    let query = supabase
      .from('contracts')
      .select(`
        id, status, payment_status, start_date, start_time, end_date, end_time,
        rate_amount, rate_type, total_amount, deposit_amount, created_at,
        client:clients(id, full_name, phone),
        car:cars(id, plate, make, model, year, status)
      `)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const normalizedSearch = search.toLowerCase();
    const contracts = normalizedSearch
      ? (data || []).filter((contract) => {
          const haystack = [
            contract.id,
            contract.client?.full_name,
            contract.client?.phone,
            contract.car?.plate,
            contract.car?.make,
            contract.car?.model,
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : (data || []);

    return res.status(200).json({ contracts, count: contracts.length });
  } catch (error) {
    return handleError(res, error);
  }
}
