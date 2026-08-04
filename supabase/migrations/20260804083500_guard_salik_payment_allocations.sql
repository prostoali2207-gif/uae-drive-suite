-- Keep Salik payment allocations and Salik row statuses in sync.
-- This prevents the same Salik transaction from being paid twice and prevents
-- a payment from being saved without the corresponding Salik status update.

create or replace function public.validate_salik_payment_allocations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocation record;
  salik_id uuid;
  salik_row public.salik%rowtype;
  old_has_same_line boolean;
begin
  if lower(coalesce(new.status, '')) <> 'paid' then
    return new;
  end if;

  for allocation in
    select key, value
    from jsonb_each_text(coalesce(new.allocations -> 'lines', '{}'::jsonb))
    where key like 'salik-%'
  loop
    begin
      salik_id := substring(allocation.key from 7)::uuid;
    exception when others then
      raise exception 'Invalid Salik allocation reference: %', allocation.key;
    end;

    if coalesce(allocation.value::numeric, 0) <= 0 then
      raise exception 'Salik allocation must be greater than zero: %', allocation.key;
    end if;

    select * into salik_row
    from public.salik
    where id = salik_id
    for update;

    if not found then
      raise exception 'Salik transaction not found: %', salik_id;
    end if;

    if salik_row.contract_id is distinct from new.contract_id then
      raise exception 'Salik transaction belongs to another contract: %', salik_id;
    end if;

    if abs(allocation.value::numeric - salik_row.amount) > 0.009 then
      raise exception 'Salik allocation must equal the transaction amount for %', salik_id;
    end if;

    old_has_same_line :=
      tg_op = 'UPDATE'
      and lower(coalesce(old.status, '')) = 'paid'
      and coalesce(old.allocations -> 'lines', '{}'::jsonb) ? allocation.key;

    if not old_has_same_line and exists (
      select 1
      from public.payments p
      where p.id is distinct from new.id
        and p.contract_id = new.contract_id
        and lower(coalesce(p.status, '')) = 'paid'
        and coalesce(p.allocations -> 'lines', '{}'::jsonb) ? allocation.key
    ) then
      raise exception 'Salik transaction is already allocated to another paid payment: %', salik_id;
    end if;

    if salik_row.status = 'Paid' and not old_has_same_line then
      raise exception 'Salik transaction is already marked paid: %', salik_id;
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.sync_salik_status_from_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line_key text;
  salik_id uuid;
begin
  for line_key in
    select distinct key
    from (
      select key
      from jsonb_each_text(coalesce(case when tg_op <> 'DELETE' then new.allocations -> 'lines' end, '{}'::jsonb))
      where key like 'salik-%'
      union all
      select key
      from jsonb_each_text(coalesce(case when tg_op <> 'INSERT' then old.allocations -> 'lines' end, '{}'::jsonb))
      where key like 'salik-%'
    ) affected
  loop
    begin
      salik_id := substring(line_key from 7)::uuid;
    exception when others then
      continue;
    end;

    update public.salik s
    set
      status = case
        when exists (
          select 1
          from public.payments p
          where p.contract_id = s.contract_id
            and lower(coalesce(p.status, '')) = 'paid'
            and coalesce(p.allocations -> 'lines', '{}'::jsonb) ? line_key
        ) then 'Paid'
        else 'Charged to Client'
      end,
      paid_at = case
        when exists (
          select 1
          from public.payments p
          where p.contract_id = s.contract_id
            and lower(coalesce(p.status, '')) = 'paid'
            and coalesce(p.allocations -> 'lines', '{}'::jsonb) ? line_key
        ) then coalesce(s.paid_at, now())
        else null
      end
    where s.id = salik_id;
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists validate_salik_payment_allocations_trigger on public.payments;
create trigger validate_salik_payment_allocations_trigger
before insert or update of status, allocations, contract_id
on public.payments
for each row
execute function public.validate_salik_payment_allocations();

drop trigger if exists sync_salik_status_from_payments_trigger on public.payments;
create trigger sync_salik_status_from_payments_trigger
after insert or update of status, allocations, contract_id or delete
on public.payments
for each row
execute function public.sync_salik_status_from_payments();
