-- Protect previously billed/paid customer fine amounts from later government
-- reimports (e.g. an expiring discount). The government's outstanding liability
-- is separate from the amount already charged to the customer.
--
-- Narrow, idempotent reconciliation of five Abu Dhabi fines with one
-- explicit AED 215 client payment each. Preserve prior source prices in notes.
WITH target_fines(contract_id, fine_number) AS (
  VALUES
    ('4b9337b9-e962-4dbb-9021-cfecb4626b9b'::uuid, '6263714918'),
    ('4b9337b9-e962-4dbb-9021-cfecb4626b9b'::uuid, '6263722019'),
    ('4b9337b9-e962-4dbb-9021-cfecb4626b9b'::uuid, '6263722058'),
    ('4b9337b9-e962-4dbb-9021-cfecb4626b9b'::uuid, '6263723042'),
    ('2360ecdd-bf9d-490d-a0a4-e0e5b79116e9'::uuid, '6264312608')
), verified AS (
  SELECT f.id, MIN(p.created_at) AS client_paid_at
  FROM public.fines f
  JOIN target_fines t ON t.contract_id=f.contract_id AND t.fine_number=f.fine_number
  JOIN public.payments p
    ON p.contract_id=f.contract_id
   AND p.owner_id=f.owner_id
   AND p.status='Paid'
   AND p.allocations->'lines' ? ('fine-' || f.id::text)
  WHERE f.amount=245 AND f.original_amount=225 AND f.service_fee=20
    AND f.status IN ('Paid','Partial')
  GROUP BY f.id
  HAVING COUNT(*)=1
     AND SUM((p.allocations->'lines'->>('fine-' || f.id::text))::numeric)=215
)
UPDATE public.fines f
SET amount=215,
    original_amount=195,
    status='Paid',
    paid_at=COALESCE(f.paid_at, v.client_paid_at),
    notes=CONCAT_WS(' | ', NULLIF(f.notes, ''),
      'Customer charge fixed at paid AED 215 (AED 195 discounted fine + AED 20 service fee). Prior government export showed AED 245 (AED 225 + AED 20). Later government settlement requires separate reconciliation.')
FROM verified v
WHERE f.id=v.id;

CREATE OR REPLACE FUNCTION public.prevent_customer_paid_fine_amount_increase()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $guard$
BEGIN
  IF NEW.amount > OLD.amount + 0.009
    AND (
      OLD.status IN ('Paid', 'Partial')
      OR EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.owner_id=OLD.owner_id
          AND p.contract_id=OLD.contract_id
          AND p.status='Paid'
          AND p.allocations->'lines' ? ('fine-' || OLD.id::text)
      )
    )
  THEN
    RAISE EXCEPTION
      'Fine customer charge cannot increase after a client payment; reconcile later government changes separately'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS trg_prevent_customer_paid_fine_amount_increase ON public.fines;
CREATE TRIGGER trg_prevent_customer_paid_fine_amount_increase
BEFORE UPDATE OF amount ON public.fines
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_paid_fine_amount_increase();
