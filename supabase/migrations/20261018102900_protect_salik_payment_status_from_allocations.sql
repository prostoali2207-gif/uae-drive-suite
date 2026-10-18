-- Only payment allocations can make a contracted Salik/Darb charge paid.
-- This protects against stale clients, status-only updates, and future reimports.
-- Deliberately does not alter any existing Salik rows.
create or replace function public.protect_salik_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated_amount numeric := 0;
  payment_line_key text := 'salik-' || new.id::text;
begin
  if new.contract_id is null then
    return new;
  end if;

  select coalesce(sum((p.allocations->'lines'->>payment_line_key)::numeric), 0)
    into allocated_amount
  from public.payments p
  where p.contract_id = new.contract_id
    and lower(coalesce(p.status, '')) = 'paid'
    and coalesce(p.allocations->'lines', '{}'::jsonb) ? payment_line_key;

  if allocated_amount > 0 and allocated_amount >= new.amount - 0.009 then
    -- Fully allocated charge must remain Paid, even after an import/status edit.
    new.status := 'Paid';
    new.paid_at := coalesce(new.paid_at, old.paid_at, now());
  elsif allocated_amount > 0 then
    -- A partial allocation is not a fully paid charge.
    new.status := 'Charged to Client';
    new.paid_at := null;
  elsif new.status = 'Paid' and old.status is distinct from 'Paid' then
    -- Prevent status-only "Mark Paid" actions from bypassing payment records.
    raise exception 'Record a contract payment before marking Salik/Darb paid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_salik_payment_status on public.salik;
create trigger trg_protect_salik_payment_status
before update of status, paid_at, amount on public.salik
for each row
execute function public.protect_salik_payment_status();
