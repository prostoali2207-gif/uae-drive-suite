-- Reconcile legacy toll charges with their already-recorded July 2026 payment.
-- This reduces only the historical service fee (not the actual toll or cash paid),
-- retaining an explanation on each charge. No generated record IDs are hardcoded.
DO $legacy_salik_reconciliation$
DECLARE
  item record;
  adjusted_count integer := 0;
  updated_rows integer;
  total_waived numeric := 0;
  corrected_contract_id uuid := null;
BEGIN
  FOR item IN
    SELECT s.id, s.contract_id, s.amount AS old_amount,
           s.original_amount, s.service_fee,
           SUM((p.allocations->'lines'->>('salik-' || s.id::text))::numeric) AS paid_amount
    FROM public.salik s
    JOIN public.payments p ON p.contract_id = s.contract_id
    WHERE s.status = 'Paid'
      AND s.charge_date BETWEEN DATE '2026-06-02' AND DATE '2026-06-18'
      AND p.payment_date = DATE '2026-07-07'
      AND lower(coalesce(p.status, '')) = 'paid'
      AND coalesce(p.allocations->'lines', '{}'::jsonb) ? ('salik-' || s.id::text)
      AND s.original_amount IN (4.2, 6.3)
      AND s.service_fee = 1
      AND s.amount IN (5.2, 7.3)
    GROUP BY s.id
    HAVING SUM((p.allocations->'lines'->>('salik-' || s.id::text))::numeric) < s.amount - 0.009
  LOOP
    IF item.paid_amount <= item.original_amount
       OR item.old_amount - item.paid_amount NOT IN (0.2, 0.3)
       OR (corrected_contract_id IS NOT NULL AND corrected_contract_id <> item.contract_id)
    THEN
      RAISE EXCEPTION 'Unexpected legacy Salik reconciliation data on %', item.id;
    END IF;
    corrected_contract_id := item.contract_id;
    UPDATE public.salik s
    SET amount = item.paid_amount,
        service_fee = round(item.paid_amount - s.original_amount, 2),
        notes = concat_ws(E'\n', nullif(s.notes, ''),
          '2026-11-04 settlement reconciliation: July 7 payment allocated AED '
          || item.paid_amount::text || '; prior charge AED '
          || item.old_amount::text || '; waived AED '
          || (item.old_amount - item.paid_amount)::text
          || ' from the service fee. Original toll and cash payment unchanged.')
    WHERE s.id = item.id AND s.status = 'Paid' AND s.amount = item.old_amount;
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    IF updated_rows <> 1 THEN
      RAISE EXCEPTION 'Could not safely reconcile Salik %', item.id;
    END IF;
    adjusted_count := adjusted_count + 1;
    total_waived := total_waived + item.old_amount - item.paid_amount;
  END LOOP;
  IF adjusted_count <> 0 AND (adjusted_count <> 18 OR abs(total_waived - 3.8) > 0.009) THEN
    RAISE EXCEPTION 'Unexpected Salik reconciliation scope: % rows / AED %',
      adjusted_count, total_waived;
  END IF;
END;
$legacy_salik_reconciliation$;

-- Older imported/payment-backed records can also have an obsolete
-- 'Charged to Client' status despite being completely settled.
-- Reconcile only entries backed by fully paid line allocations for their contract.
WITH fully_paid AS (
  SELECT s.id
  FROM public.salik s
  JOIN public.payments p ON p.contract_id = s.contract_id
  WHERE s.status = 'Charged to Client'
    AND lower(coalesce(p.status, '')) = 'paid'
    AND coalesce(p.allocations->'lines', '{}'::jsonb) ? ('salik-' || s.id::text)
  GROUP BY s.id
  HAVING SUM((p.allocations->'lines'->>('salik-' || s.id::text))::numeric)
         >= MAX(s.amount) - 0.009
)
UPDATE public.salik s
SET status = 'Paid', paid_at = coalesce(s.paid_at, now())
FROM fully_paid f
WHERE s.id = f.id AND s.status = 'Charged to Client';

-- Existing payments trigger handles edits to payment records.
-- Protect the *charge* side too: no price/VAT/fee edits after settlement,
-- and no 'Paid' status without an adequate actual payment allocation.
CREATE OR REPLACE FUNCTION public.protect_salik_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $protect_salik$
DECLARE
  allocated_amount numeric := 0;
  payment_line_key text := 'salik-' || new.id::text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF new.contract_id IS NOT NULL AND lower(coalesce(new.status, '')) = 'paid' THEN
      RAISE EXCEPTION 'Record a contract payment before marking Salik/Darb paid'
        USING errcode = '23514';
    END IF;
    RETURN new;
  END IF;

  IF lower(coalesce(old.status, '')) = 'paid'
     AND (new.amount IS DISTINCT FROM old.amount
       OR new.original_amount IS DISTINCT FROM old.original_amount
       OR new.service_fee IS DISTINCT FROM old.service_fee)
  THEN
    RAISE EXCEPTION 'Settled Salik/Darb amount and service fee cannot be changed'
      USING errcode = '23514';
  END IF;

  IF new.contract_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT coalesce(sum((p.allocations->'lines'->>payment_line_key)::numeric), 0)
  INTO allocated_amount
  FROM public.payments p
  WHERE p.contract_id = new.contract_id
    AND lower(coalesce(p.status, '')) = 'paid'
    AND coalesce(p.allocations->'lines', '{}'::jsonb) ? payment_line_key;

  IF allocated_amount > 0 AND allocated_amount >= new.amount - 0.009 THEN
    new.status := 'Paid';
    new.paid_at := coalesce(new.paid_at, old.paid_at, now());
  ELSIF allocated_amount > 0 THEN
    new.status := 'Charged to Client';
    new.paid_at := NULL;
  ELSIF lower(coalesce(new.status, '')) = 'paid' THEN
    RAISE EXCEPTION 'Paid Salik/Darb requires a matching recorded payment'
      USING errcode = '23514';
  END IF;
  RETURN new;
END;
$protect_salik$;

DROP TRIGGER IF EXISTS trg_protect_salik_payment_status ON public.salik;
CREATE TRIGGER trg_protect_salik_payment_status
BEFORE INSERT OR UPDATE OF contract_id, status, paid_at, amount, original_amount, service_fee
ON public.salik
FOR EACH ROW EXECUTE FUNCTION public.protect_salik_payment_status();
