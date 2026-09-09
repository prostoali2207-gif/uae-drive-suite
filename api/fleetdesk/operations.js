import { createHash } from 'node:crypto';
import {
  getAdminClient,
  getOwnerId,
  handleError,
} from '../_lib/fleetdesk.js';

const PEACH_TOKEN_SHA256 = 'a837eb5861426d57f2b47398aac8f43dc3852a4d74651aecfb0ccb6ccb73dc6f';
const MUTATING_ACTIONS = new Set(['extend_contract', 'record_payment', 'add_fee', 'close_contract']);
const REQUEST_ACTIONS = new Set(['request_extension', 'request_return']);
const IGNORED_OVERLAP_STATUSES = new Set(['cancelled', 'canceled', 'void', 'deleted', 'deleted draft']);
const PAYMENT_CATEGORIES = ['rental', 'fees', 'fines', 'salik', 'parking'];
const VEHICLE_RETURN_STATUSES = new Set(['Available', 'Under Service', 'Reserved', 'Unavailable']);
const PAYMENT_METHODS = new Set(['Cash', 'Card', 'Transfer']);
const FEE_CATEGORIES = new Set(['delivery', 'pickup', 'fuel', 'other']);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Peach-Token');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorize(req, res) {
  const bearer = req.headers.authorization || '';
  const expectedBearer = process.env.FLEETDESK_GPT_API_KEY
    ? `Bearer ${process.env.FLEETDESK_GPT_API_KEY}`
    : null;

  if (expectedBearer && secureEqual(bearer, expectedBearer)) return true;

  const peachToken = String(req.headers['x-peach-token'] || '');
  if (peachToken) {
    const digest = createHash('sha256').update(peachToken).digest('hex');
    if (secureEqual(digest, PEACH_TOKEN_SHA256)) return true;
  }

  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeTime(value) {
  const raw = String(value || '').trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  return null;
}

function parseDateTime(date, time, fallback = '12:00:00') {
  const safeTime = normalizeTime(time) || fallback;
  const parsed = new Date(`${date}T${safeTime}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function todayDubai() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function paymentCategoryForFee(fee) {
  const label = String(fee.label || '').trim();
  const hasExtensionPeriod = Boolean(fee.extension_start || fee.extension_end) ||
    /^Rental Extension:\s*\d{4}-\d{2}-\d{2}\s*-\s*\d{4}-\d{2}-\d{2}$/i.test(label);
  const isExtensionCharge = !fee.extension_start && !fee.extension_end && /^Rent Extension #\d+$/i.test(label);
  return hasExtensionPeriod || isExtensionCharge ? 'rental' : 'fees';
}

function readSavedAllocationLines(allocations) {
  if (!allocations || typeof allocations !== 'object') return {};
  const lines = allocations.lines;
  return lines && typeof lines === 'object' && !Array.isArray(lines) ? lines : {};
}

function readSavedGroupedAllocations(allocations) {
  if (!allocations || typeof allocations !== 'object') return null;
  const result = {};
  let found = false;
  for (const category of PAYMENT_CATEGORIES) {
    const n = Number(allocations[category] || 0);
    result[category] = Number.isFinite(n) ? n : 0;
    if (result[category] > 0) found = true;
  }
  return found ? result : null;
}

function buildAllocationState(lines, payments) {
  const paidByLine = new Map(lines.map((line) => [line.id, 0]));

  const addLinePayment = (lineId, amountToAdd) => {
    const line = lines.find((item) => item.id === lineId);
    if (!line || amountToAdd <= 0) return 0;
    const currentPaid = paidByLine.get(lineId) || 0;
    const applied = Math.min(Number(line.due), currentPaid + amountToAdd) - currentPaid;
    paidByLine.set(lineId, currentPaid + applied);
    return applied;
  };

  const distributePayment = (candidateLines, amount) => {
    let remaining = Number(amount);
    for (const line of candidateLines) {
      if (remaining <= 0.009) break;
      remaining -= addLinePayment(line.id, remaining);
    }
    return Number(amount) - remaining;
  };

  [...payments]
    .filter((payment) => String(payment.status || '').toLowerCase() === 'paid')
    .sort((a, b) => String(a.payment_date || '').localeCompare(String(b.payment_date || '')))
    .forEach((payment) => {
      const lineAllocations = readSavedAllocationLines(payment.allocations);
      let applied = 0;

      if (Object.keys(lineAllocations).length > 0) {
        for (const [lineId, raw] of Object.entries(lineAllocations)) {
          const value = Number(raw);
          if (value > 0) applied += addLinePayment(lineId, value);
        }
      } else {
        const grouped = readSavedGroupedAllocations(payment.allocations);
        if (grouped) {
          for (const category of PAYMENT_CATEGORIES) {
            if (grouped[category] > 0) {
              applied += distributePayment(lines.filter((line) => line.category === category), grouped[category]);
            }
          }
        }
      }

      const remainder = Number(payment.amount || 0) - applied;
      if (remainder > 0.009) distributePayment(lines, remainder);
    });

  return lines
    .map((line) => ({ ...line, due: roundMoney(Math.max(0, Number(line.due) - (paidByLine.get(line.id) || 0))) }))
    .filter((line) => line.due > 0.009);
}

function allocateAmount(unpaidLines, amount, mode = 'all') {
  const allowedMode = PAYMENT_CATEGORIES.includes(mode) ? mode : 'all';
  const candidates = allowedMode === 'all'
    ? unpaidLines
    : unpaidLines.filter((line) => line.category === allowedMode);

  const selectedDue = roundMoney(candidates.reduce((sum, line) => sum + Number(line.due), 0));
  if (amount > selectedDue + 0.009) {
    throw new Error(`Payment exceeds outstanding ${allowedMode === 'all' ? 'balance' : allowedMode} amount.`);
  }

  let remaining = roundMoney(amount);
  const lines = {};
  const grouped = { rental: 0, fees: 0, fines: 0, salik: 0, parking: 0 };

  for (const line of candidates) {
    if (remaining <= 0.009) break;
    const applied = roundMoney(Math.min(remaining, Number(line.due)));
    if (applied <= 0) continue;
    lines[line.id] = applied;
    grouped[line.category] = roundMoney(grouped[line.category] + applied);
    remaining = roundMoney(remaining - applied);
  }

  if (remaining > 0.009) throw new Error('Could not allocate the full payment safely.');
  return { ...grouped, lines };
}

async function getActor(supabase, ownerId, actorPhone) {
  const normalized = normalizePhone(actorPhone);
  if (!normalized) return { type: 'unknown', id: null, name: null, role: null };

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id, full_name, role, phone, status')
    .eq('owner_id', ownerId)
    .eq('status', 'active');
  if (staffError) throw staffError;

  const staff = (staffRows || []).find((row) => normalizePhone(row.phone) === normalized);
  if (staff) return { type: 'staff', id: staff.id, name: staff.full_name, role: staff.role };

  const { data: clientRows, error: clientError } = await supabase
    .from('clients')
    .select('id, full_name, phone')
    .eq('owner_id', ownerId);
  if (clientError) throw clientError;

  const client = (clientRows || []).find((row) => normalizePhone(row.phone) === normalized);
  if (client) return { type: 'client', id: client.id, name: client.full_name, role: null };

  return { type: 'unknown', id: null, name: null, role: null };
}

async function getContract(supabase, ownerId, contractId) {
  if (!contractId) throw new Error('contract_id is required.');
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      id, owner_id, client_id, car_id, start_date, start_time, end_date, end_time,
      rate_type, rate_amount, total_amount, deposit_amount, initial_mileage, mileage_unit,
      fuel_level, status, payment_status, notes,
      client:clients(id, full_name, phone),
      car:cars(id, plate, make, model, status)
    `)
    .eq('owner_id', ownerId)
    .eq('id', contractId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Contract not found.');
  return data;
}

function ensureActorCanReadContract(actor, contract) {
  if (actor.type === 'staff') return;
  if (actor.type === 'client' && actor.id === contract.client_id) return;
  throw new Error('This phone number is not authorized for this contract.');
}

async function buildContractLedger(supabase, contract) {
  const [feesRes, finesRes, salikRes, parkingRes, paymentsRes] = await Promise.all([
    supabase.from('contract_fees')
      .select('id, label, amount, category, extension_start, extension_end, created_at')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: true }),
    supabase.from('fines')
      .select('id, amount')
      .eq('contract_id', contract.id),
    supabase.from('salik')
      .select('id, amount')
      .eq('contract_id', contract.id),
    supabase.from('parking_charges')
      .select('id, amount')
      .eq('contract_id', contract.id),
    supabase.from('payments')
      .select('id, amount, payment_date, status, allocations')
      .eq('contract_id', contract.id)
      .order('payment_date', { ascending: true }),
  ]);

  for (const result of [feesRes, finesRes, salikRes, parkingRes, paymentsRes]) {
    if (result.error) throw result.error;
  }

  const grossLines = [{
    id: `rental-${contract.id}`,
    category: 'rental',
    label: 'Original Contract',
    due: Number(contract.total_amount),
  }];

  for (const fee of feesRes.data || []) {
    const due = Number(fee.amount);
    if (!(due > 0)) continue;
    grossLines.push({
      id: `fee-${fee.id}`,
      category: paymentCategoryForFee(fee),
      label: fee.label,
      due,
    });
  }
  for (const fine of finesRes.data || []) {
    if (Number(fine.amount) > 0) grossLines.push({ id: `fine-${fine.id}`, category: 'fines', label: 'Traffic Fine', due: Number(fine.amount) });
  }
  for (const charge of salikRes.data || []) {
    if (Number(charge.amount) > 0) grossLines.push({ id: `salik-${charge.id}`, category: 'salik', label: 'Salik', due: Number(charge.amount) });
  }
  for (const charge of parkingRes.data || []) {
    if (Number(charge.amount) > 0) grossLines.push({ id: `parking-${charge.id}`, category: 'parking', label: 'Parking', due: Number(charge.amount) });
  }

  const unpaidLines = buildAllocationState(grossLines, paymentsRes.data || []);
  const outstanding = roundMoney(unpaidLines.reduce((sum, line) => sum + Number(line.due), 0));

  return {
    grossLines,
    unpaidLines,
    outstanding,
    payments: paymentsRes.data || [],
  };
}

async function ensureNoExtensionOverlap(supabase, contract, newEndDate, newEndTime) {
  const start = parseDateTime(contract.end_date, contract.end_time);
  const end = parseDateTime(newEndDate, newEndTime);
  if (!start || !end || end <= start) throw new Error('New end date and time must be later than the current contract end.');

  const { data: candidates, error } = await supabase
    .from('contracts')
    .select('id, status, start_date, start_time, end_date, end_time')
    .eq('owner_id', contract.owner_id)
    .eq('car_id', contract.car_id)
    .neq('id', contract.id)
    .lte('start_date', newEndDate)
    .gte('end_date', contract.end_date);
  if (error) throw error;

  const conflict = (candidates || []).find((candidate) => {
    if (IGNORED_OVERLAP_STATUSES.has(String(candidate.status || '').trim().toLowerCase())) return false;
    const candidateStart = parseDateTime(candidate.start_date, candidate.start_time);
    const candidateEnd = parseDateTime(candidate.end_date, candidate.end_time);
    return candidateStart && candidateEnd && candidateStart < end && candidateEnd > start;
  });

  if (conflict) throw new Error(`Vehicle has an overlapping contract: ${String(conflict.id).slice(0, 8).toUpperCase()}.`);
}

async function findExistingAudit(supabase, ownerId, idempotencyKey) {
  const { data, error } = await supabase
    .from('whatsapp_operation_requests')
    .select('id, status, result, action, contract_id')
    .eq('owner_id', ownerId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createAudit(supabase, ownerId, idempotencyKey, actor, actorPhone, action, contractId, payload) {
  const { data, error } = await supabase
    .from('whatsapp_operation_requests')
    .insert({
      owner_id: ownerId,
      idempotency_key: idempotencyKey,
      actor_phone: actorPhone,
      actor_type: actor.type,
      actor_staff_id: actor.type === 'staff' ? actor.id : null,
      actor_client_id: actor.type === 'client' ? actor.id : null,
      action,
      contract_id: contractId || null,
      payload: payload || {},
      status: 'received',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function finishAudit(supabase, auditId, status, result) {
  const { error } = await supabase
    .from('whatsapp_operation_requests')
    .update({
      status,
      result,
      processed_at: new Date().toISOString(),
    })
    .eq('id', auditId);
  if (error) throw error;
}

async function handleContractContext(supabase, ownerId, actor, contractId) {
  const contract = await getContract(supabase, ownerId, contractId);
  ensureActorCanReadContract(actor, contract);
  const ledger = await buildContractLedger(supabase, contract);

  return {
    ok: true,
    action: 'contract_context',
    contract: {
      id: contract.id,
      status: contract.status,
      payment_status: contract.payment_status,
      start_date: contract.start_date,
      start_time: contract.start_time,
      end_date: contract.end_date,
      end_time: contract.end_time,
      rate_type: contract.rate_type,
      rate_amount: Number(contract.rate_amount),
      total_amount: Number(contract.total_amount),
      deposit_amount: Number(contract.deposit_amount),
      client: contract.client,
      car: contract.car,
    },
    outstanding: ledger.outstanding,
    unpaid: ledger.unpaidLines,
  };
}

async function handleRequestAction(supabase, ownerId, actor, action, contractId, payload) {
  const contract = await getContract(supabase, ownerId, contractId);
  ensureActorCanReadContract(actor, contract);
  return {
    ok: true,
    action,
    request_only: true,
    contract_id: contract.id,
    vehicle: contract.car,
    client: contract.client,
    requested: payload || {},
  };
}

async function handleExtendContract(supabase, ownerId, contractId, payload) {
  const contract = await getContract(supabase, ownerId, contractId);
  const allowedStatuses = new Set(['active', 'expiring soon', 'overdue']);
  if (!allowedStatuses.has(String(contract.status || '').trim().toLowerCase())) {
    throw new Error(`Contract status ${contract.status} cannot be extended.`);
  }

  const newEndDate = String(payload.new_end_date || '');
  const newEndTime = normalizeTime(payload.new_end_time);
  const rentAmount = roundMoney(payload.rent_amount);
  if (!isDate(newEndDate) || !newEndTime) throw new Error('new_end_date and new_end_time are required.');
  if (!(rentAmount > 0)) throw new Error('rent_amount must be greater than zero.');

  await ensureNoExtensionOverlap(supabase, contract, newEndDate, newEndTime);

  const { data: duplicateExtension, error: duplicateError } = await supabase
    .from('contract_fees')
    .select('id')
    .eq('contract_id', contract.id)
    .eq('extension_start', contract.end_date)
    .eq('extension_end', newEndDate)
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicateExtension) throw new Error('This extension period already exists.');

  const { data: markers, error: markerError } = await supabase
    .from('contract_fees')
    .select('id')
    .eq('contract_id', contract.id)
    .not('extension_start', 'is', null);
  if (markerError) throw markerError;
  const extensionNumber = (markers || []).length + 1;

  const oldEndDate = contract.end_date;
  const oldEndTime = contract.end_time;
  const { error: updateError } = await supabase
    .from('contracts')
    .update({ end_date: newEndDate, end_time: newEndTime })
    .eq('owner_id', ownerId)
    .eq('id', contract.id);
  if (updateError) throw updateError;

  const { error: feeError } = await supabase
    .from('contract_fees')
    .insert([
      {
        contract_id: contract.id,
        category: 'other',
        label: `Rental Extension: ${oldEndDate} - ${newEndDate}`,
        amount: 0,
        extension_start: oldEndDate,
        extension_end: newEndDate,
        owner_id: ownerId,
      },
      {
        contract_id: contract.id,
        category: 'other',
        label: `Rent Extension #${extensionNumber}`,
        amount: rentAmount,
        owner_id: ownerId,
      },
    ]);

  if (feeError) {
    await supabase
      .from('contracts')
      .update({ end_date: oldEndDate, end_time: oldEndTime })
      .eq('owner_id', ownerId)
      .eq('id', contract.id);
    throw new Error(`Extension was rolled back because the charge could not be saved: ${feeError.message}`);
  }

  return {
    ok: true,
    action: 'extend_contract',
    contract_id: contract.id,
    previous_end: { date: oldEndDate, time: oldEndTime },
    new_end: { date: newEndDate, time: newEndTime },
    rent_amount: rentAmount,
  };
}

async function handleRecordPayment(supabase, ownerId, contractId, payload) {
  const contract = await getContract(supabase, ownerId, contractId);
  const amount = roundMoney(payload.amount);
  const method = String(payload.method || '');
  const allocationMode = String(payload.allocation_mode || 'all').toLowerCase();
  const paymentDate = payload.payment_date ? String(payload.payment_date) : todayDubai();

  if (!(amount > 0)) throw new Error('amount must be greater than zero.');
  if (!PAYMENT_METHODS.has(method)) throw new Error('method must be Cash, Card, or Transfer.');
  if (!isDate(paymentDate)) throw new Error('payment_date must be YYYY-MM-DD.');
  if (allocationMode !== 'all' && !PAYMENT_CATEGORIES.includes(allocationMode)) {
    throw new Error('allocation_mode must be all, rental, fees, fines, salik, or parking.');
  }

  const ledger = await buildContractLedger(supabase, contract);
  if (ledger.outstanding <= 0) throw new Error('Contract has no outstanding balance.');
  const allocations = allocateAmount(ledger.unpaidLines, amount, allocationMode);

  const { data, error } = await supabase
    .from('payments')
    .insert({
      contract_id: contract.id,
      client_id: contract.client_id,
      amount,
      method,
      payment_date: paymentDate,
      status: 'Paid',
      owner_id: ownerId,
      allocations,
    })
    .select('id')
    .single();
  if (error) throw error;

  return {
    ok: true,
    action: 'record_payment',
    contract_id: contract.id,
    payment_id: data.id,
    amount,
    method,
    payment_date: paymentDate,
    allocations,
    previous_outstanding: ledger.outstanding,
    remaining_outstanding: roundMoney(Math.max(0, ledger.outstanding - amount)),
  };
}

async function handleAddFee(supabase, ownerId, contractId, payload) {
  const contract = await getContract(supabase, ownerId, contractId);
  const amount = roundMoney(payload.amount);
  const category = String(payload.category || '').toLowerCase();
  const label = String(payload.label || '').trim();
  const note = String(payload.note || '').trim();

  if (!(amount > 0)) throw new Error('amount must be greater than zero.');
  if (!FEE_CATEGORIES.has(category)) throw new Error('category must be delivery, pickup, fuel, or other.');
  if (!label) throw new Error('label is required.');

  const { data, error } = await supabase
    .from('contract_fees')
    .insert({
      contract_id: contract.id,
      category,
      label,
      amount,
      note: note || null,
      owner_id: ownerId,
    })
    .select('id')
    .single();
  if (error) throw error;

  return {
    ok: true,
    action: 'add_fee',
    contract_id: contract.id,
    fee_id: data.id,
    category,
    label,
    amount,
  };
}

async function handleCloseContract(supabase, ownerId, actor, contractId, payload) {
  const contract = await getContract(supabase, ownerId, contractId);
  const closedStatuses = new Set(['closed', 'completed', 'cancelled', 'canceled']);
  if (closedStatuses.has(String(contract.status || '').trim().toLowerCase())) {
    throw new Error(`Contract is already ${contract.status}.`);
  }

  const actualReturnAt = String(payload.actual_return_at || '');
  const match = actualReturnAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  if (!match) throw new Error('actual_return_at must be YYYY-MM-DDTHH:MM.');
  const actualReturnDate = match[1];
  const actualReturnTime = `${match[2]}:00`;

  const finalMileage = Number(payload.final_mileage);
  if (!Number.isFinite(finalMileage) || finalMileage < Number(contract.initial_mileage)) {
    throw new Error('final_mileage must be valid and not lower than initial mileage.');
  }

  const vehicleStatus = String(payload.vehicle_status || '');
  if (!VEHICLE_RETURN_STATUSES.has(vehicleStatus)) {
    throw new Error('vehicle_status must be Available, Under Service, Reserved, or Unavailable.');
  }

  const depositAmount = Math.max(0, Number(contract.deposit_amount) || 0);
  const ledger = await buildContractLedger(supabase, contract);
  const outstanding = ledger.outstanding;
  const depositAction = depositAmount > 0 ? String(payload.deposit_action || '') : 'none';

  if (depositAmount > 0 && !['return_full', 'apply_to_balance', 'retain_partial', 'retain_full'].includes(depositAction)) {
    throw new Error('deposit_action is required for contracts with a deposit.');
  }

  let retainedAmount = 0;
  let appliedAmount = 0;
  if (depositAction === 'retain_full') retainedAmount = depositAmount;
  if (depositAction === 'retain_partial') retainedAmount = roundMoney(payload.deposit_retained_amount);
  if (depositAction === 'apply_to_balance') appliedAmount = roundMoney(Math.min(depositAmount, outstanding));

  if (depositAction === 'retain_partial' && (!(retainedAmount > 0) || retainedAmount > depositAmount)) {
    throw new Error('deposit_retained_amount must be greater than zero and not exceed the deposit.');
  }
  if (depositAction === 'apply_to_balance' && !(appliedAmount > 0)) {
    throw new Error('There is no outstanding balance to apply the deposit to.');
  }

  const retainReason = String(payload.deposit_retain_reason || '').trim();
  if (['retain_partial', 'retain_full'].includes(depositAction) && !retainReason) {
    throw new Error('deposit_retain_reason is required when retaining a deposit.');
  }

  const pendingReturnAmount = roundMoney(Math.max(0, depositAmount - retainedAmount - appliedAmount));
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('deposit_return_days')
    .eq('id', ownerId)
    .maybeSingle();
  if (profileError) throw profileError;
  const returnDays = Number.isFinite(Number(profile?.deposit_return_days))
    ? Math.max(0, Number(profile.deposit_return_days))
    : 15;
  const returnDueDate = pendingReturnAmount > 0
    ? (payload.deposit_return_due_date ? String(payload.deposit_return_due_date) : addDays(actualReturnDate, returnDays))
    : null;
  if (returnDueDate && !isDate(returnDueDate)) throw new Error('deposit_return_due_date must be YYYY-MM-DD.');

  let depositPaymentId = null;
  let maintenanceId = null;
  const oldCarStatus = contract.car?.status || null;
  const oldContract = {
    status: contract.status,
    end_date: contract.end_date,
    end_time: contract.end_time,
    notes: contract.notes,
    deposit_status: null,
  };

  const { data: oldDepositRow, error: oldDepositError } = await supabase
    .from('contracts')
    .select('deposit_status')
    .eq('id', contract.id)
    .maybeSingle();
  if (oldDepositError) throw oldDepositError;
  oldContract.deposit_status = oldDepositRow?.deposit_status ?? null;

  try {
    const { data: maintenance, error: maintenanceError } = await supabase
      .from('car_maintenance')
      .insert({
        car_id: contract.car_id,
        owner_id: ownerId,
        current_mileage: finalMileage,
        notes: `Contract ${contract.id.slice(0, 8).toUpperCase()} return mileage`,
      })
      .select('id')
      .single();
    if (maintenanceError) throw maintenanceError;
    maintenanceId = maintenance.id;

    if (appliedAmount > 0) {
      const allocations = allocateAmount(ledger.unpaidLines, appliedAmount, 'all');
      const { data: depositPayment, error: depositPaymentError } = await supabase
        .from('payments')
        .insert({
          contract_id: contract.id,
          client_id: contract.client_id,
          amount: appliedAmount,
          method: 'Security Deposit',
          payment_date: todayDubai(),
          status: 'Paid',
          owner_id: ownerId,
          allocations: { ...allocations, source: 'security_deposit' },
        })
        .select('id')
        .single();
      if (depositPaymentError) throw depositPaymentError;
      depositPaymentId = depositPayment.id;
    }

    const receivedBy = String(payload.received_by || actor.name || '').trim();
    const depositStatus = depositAmount > 0
      ? (depositAction === 'retain_full' ? 'Retained' : 'Pending Return')
      : oldContract.deposit_status;

    const noteParts = [];
    if (depositAmount > 0) {
      const actionLabel = depositAction === 'return_full'
        ? 'Schedule full deposit return'
        : depositAction === 'apply_to_balance'
          ? 'Apply to outstanding balance'
          : depositAction === 'retain_partial'
            ? 'Retain partial amount'
            : 'Retain full deposit';
      noteParts.push(
        '[Deposit reconciliation]',
        `Action: ${actionLabel}`,
        `Status: ${depositStatus}`,
        `Deposit held: AED ${roundMoney(depositAmount)}`,
        `Outstanding at close: AED ${roundMoney(outstanding)}`,
        `Applied to balance: AED ${roundMoney(appliedAmount)}`,
        `Retained: AED ${roundMoney(retainedAmount)}`,
        `Pending return: AED ${roundMoney(pendingReturnAmount)}`,
        `Return due: ${returnDueDate || 'No return due'}`,
        `Final outstanding: AED ${roundMoney(Math.max(0, outstanding - appliedAmount))}`,
      );
      if (retainReason) noteParts.push(`Reason: ${retainReason}`);
      noteParts.push(`Closed/returned at: ${actualReturnAt}`);
      if (receivedBy) noteParts.push(`Received by: ${receivedBy}`);
    }

    const reconciliationNote = noteParts.length ? noteParts.join(' | ') : null;
    const updatedNotes = reconciliationNote
      ? [String(contract.notes || '').trim(), reconciliationNote].filter(Boolean).join('\n')
      : contract.notes;

    const [contractUpdate, carUpdate] = await Promise.all([
      supabase
        .from('contracts')
        .update({
          status: 'Closed',
          end_date: actualReturnDate,
          end_time: actualReturnTime,
          notes: updatedNotes,
          deposit_status: depositStatus,
        })
        .eq('owner_id', ownerId)
        .eq('id', contract.id),
      supabase
        .from('cars')
        .update({ status: vehicleStatus })
        .eq('owner_id', ownerId)
        .eq('id', contract.car_id),
    ]);

    if (contractUpdate.error || carUpdate.error) {
      throw contractUpdate.error || carUpdate.error;
    }

    return {
      ok: true,
      action: 'close_contract',
      contract_id: contract.id,
      actual_return_at: actualReturnAt,
      final_mileage: finalMileage,
      vehicle_status: vehicleStatus,
      deposit: {
        held: roundMoney(depositAmount),
        action: depositAction,
        applied: roundMoney(appliedAmount),
        retained: roundMoney(retainedAmount),
        pending_return: roundMoney(pendingReturnAmount),
        return_due_date: returnDueDate,
      },
      remaining_outstanding: roundMoney(Math.max(0, outstanding - appliedAmount)),
    };
  } catch (error) {
    await Promise.allSettled([
      depositPaymentId ? supabase.from('payments').delete().eq('id', depositPaymentId) : Promise.resolve(),
      maintenanceId ? supabase.from('car_maintenance').delete().eq('id', maintenanceId) : Promise.resolve(),
      supabase
        .from('contracts')
        .update({
          status: oldContract.status,
          end_date: oldContract.end_date,
          end_time: oldContract.end_time,
          notes: oldContract.notes,
          deposit_status: oldContract.deposit_status,
        })
        .eq('owner_id', ownerId)
        .eq('id', contract.id),
      oldCarStatus
        ? supabase.from('cars').update({ status: oldCarStatus }).eq('owner_id', ownerId).eq('id', contract.car_id)
        : Promise.resolve(),
    ]);
    throw error;
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorize(req, res)) return;

  const supabase = getAdminClient();
  const ownerId = getOwnerId();
  let auditId = null;

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const idempotencyKey = String(body.idempotency_key || '').trim();
    const actorPhone = String(body.actor_phone || '').trim();
    const action = String(body.action || '').trim();
    const contractId = body.contract_id ? String(body.contract_id) : null;
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

    if (!idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({ error: 'idempotency_key is required and must be 200 characters or fewer.' });
    }
    if (!actorPhone) return res.status(400).json({ error: 'actor_phone is required.' });
    if (!action) return res.status(400).json({ error: 'action is required.' });

    const existing = await findExistingAudit(supabase, ownerId, idempotencyKey);
    if (existing) {
      return res.status(200).json({
        duplicate: true,
        status: existing.status,
        action: existing.action,
        contract_id: existing.contract_id,
        result: existing.result,
      });
    }

    const actor = await getActor(supabase, ownerId, actorPhone);
    if (actor.type === 'unknown') {
      return res.status(403).json({ error: 'Phone number is not recognized as FleetDesk staff or client.' });
    }

    auditId = await createAudit(
      supabase,
      ownerId,
      idempotencyKey,
      actor,
      actorPhone,
      action,
      contractId,
      payload,
    );

    let result;
    if (action === 'contract_context') {
      result = await handleContractContext(supabase, ownerId, actor, contractId);
    } else if (REQUEST_ACTIONS.has(action)) {
      result = await handleRequestAction(supabase, ownerId, actor, action, contractId, payload);
    } else if (MUTATING_ACTIONS.has(action)) {
      if (actor.type !== 'staff') throw new Error('Only active staff can perform this action.');

      if (action === 'extend_contract') {
        result = await handleExtendContract(supabase, ownerId, contractId, payload);
      } else if (action === 'record_payment') {
        result = await handleRecordPayment(supabase, ownerId, contractId, payload);
      } else if (action === 'add_fee') {
        result = await handleAddFee(supabase, ownerId, contractId, payload);
      } else {
        result = await handleCloseContract(supabase, ownerId, actor, contractId, payload);
      }
    } else {
      throw new Error('Unsupported action.');
    }

    const finalStatus = REQUEST_ACTIONS.has(action) ? 'requested' : 'applied';
    await finishAudit(supabase, auditId, finalStatus, result);
    return res.status(200).json(result);
  } catch (error) {
    if (auditId) {
      try {
        await finishAudit(supabase, auditId, 'failed', {
          ok: false,
          error: error instanceof Error ? error.message : 'Unexpected error',
        });
      } catch (auditError) {
        console.error('Failed to update WhatsApp audit row', auditError);
      }
    }

    if (error instanceof Error && (
      error.message.includes('required') ||
      error.message.includes('must be') ||
      error.message.includes('cannot be') ||
      error.message.includes('not authorized') ||
      error.message.includes('not recognized') ||
      error.message.includes('already') ||
      error.message.includes('outstanding') ||
      error.message.includes('overlapping')
    )) {
      return res.status(400).json({ error: error.message });
    }

    return handleError(res, error);
  }
}
