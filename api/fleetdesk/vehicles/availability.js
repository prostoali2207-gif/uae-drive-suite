import {
  authorize,
  getAdminClient,
  getOwnerId,
  handleError,
  overlaps,
  setCors,
  toDateTime,
} from '../../_lib/fleetdesk.js';

const NON_BLOCKING_STATUSES = new Set(['cancelled', 'closed', 'completed']);

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!authorize(req, res)) return;

    const ownerId = getOwnerId();
    const supabase = getAdminClient();
    const plate = String(req.query.plate || '').trim();
    const carId = String(req.query.car_id || '').trim();
    const start = String(req.query.start || '').trim();
    const end = String(req.query.end || '').trim();

    if ((!plate && !carId) || !start || !end) {
      return res.status(400).json({
        error: 'Provide plate or car_id, plus start and end in ISO date-time format.',
      });
    }

    const requestedStart = new Date(start);
    const requestedEnd = new Date(end);
    if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
      return res.status(400).json({ error: 'Invalid start or end date-time.' });
    }
    if (requestedStart >= requestedEnd) {
      return res.status(400).json({ error: 'End must be after start.' });
    }

    let carQuery = supabase
      .from('cars')
      .select('id, plate, make, model, year, status')
      .eq('owner_id', ownerId)
      .limit(1);

    carQuery = carId ? carQuery.eq('id', carId) : carQuery.ilike('plate', plate);

    const { data: cars, error: carError } = await carQuery;
    if (carError) throw carError;
    const car = cars?.[0];
    if (!car) return res.status(404).json({ error: 'Vehicle not found.' });

    const { data: contracts, error: contractError } = await supabase
      .from('contracts')
      .select('id, status, start_date, start_time, end_date, end_time')
      .eq('owner_id', ownerId)
      .eq('car_id', car.id);
    if (contractError) throw contractError;

    const conflicts = (contracts || []).filter((contract) => {
      if (NON_BLOCKING_STATUSES.has(String(contract.status).toLowerCase())) return false;
      const contractStart = toDateTime(contract.start_date, contract.start_time, false);
      const contractEnd = toDateTime(contract.end_date, contract.end_time, true);
      return overlaps(requestedStart, requestedEnd, contractStart, contractEnd);
    });

    const unavailableByStatus = ['maintenance', 'rented', 'overdue'].includes(
      String(car.status).toLowerCase(),
    );
    const available = !unavailableByStatus && conflicts.length === 0;

    return res.status(200).json({
      available,
      vehicle: car,
      requested_period: { start: requestedStart.toISOString(), end: requestedEnd.toISOString() },
      reason: available
        ? 'Vehicle is available for this period.'
        : unavailableByStatus
          ? `Vehicle status is ${car.status}.`
          : 'Vehicle has an overlapping contract.',
      conflicting_contracts: conflicts,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
