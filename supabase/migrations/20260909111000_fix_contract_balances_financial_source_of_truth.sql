create or replace view public.contract_balances
with (security_invoker = true)
as
with ledger as (
  select
    c.id as contract_id,
    c.total_amount::numeric as total_amount,
    coalesce((
      select sum(cf.amount)
      from public.contract_fees cf
      where cf.contract_id = c.id
        and cf.extension_start is null
        and cf.extension_end is null
    ), 0::numeric) as total_fees,
    coalesce((
      select sum(f.amount)
      from public.fines f
      where f.contract_id = c.id
    ), 0::numeric) as total_fines,
    coalesce((
      select sum(s.amount)
      from public.salik s
      where s.contract_id = c.id
    ), 0::numeric) as total_salik,
    coalesce((
      select sum(pc.amount)
      from public.parking_charges pc
      where pc.contract_id = c.id
    ), 0::numeric) as total_parking,
    coalesce((
      select sum(p.amount)
      from public.payments p
      where p.contract_id = c.id
        and lower(coalesce(p.status, '')) = 'paid'
    ), 0::numeric) as total_paid
  from public.contracts c
),
calculated as (
  select
    *,
    total_amount + total_fees + total_fines + total_salik + total_parking as total_charges
  from ledger
)
select
  contract_id,
  total_amount,
  case
    when total_charges - total_paid <= 0.009 then 'Paid'
    when total_paid > 0.009 then 'Partial'
    else 'Unpaid'
  end::text as payment_status,
  total_fees,
  total_fines,
  total_salik,
  total_paid,
  greatest(0::numeric, total_charges - total_paid) as balance_due,
  total_parking,
  greatest(0::numeric, total_paid - total_charges) as credit_balance
from calculated;

revoke all on table public.contract_balances from anon;
revoke all on table public.contract_balances from authenticated;
grant select on table public.contract_balances to authenticated;
grant select on table public.contract_balances to service_role;
