create or replace function public.validate_payment_allocations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocation record;
  line_id uuid;
  item_amount numeric;
  item_contract_id uuid;
  old_line_value numeric;
  old_has_same_line boolean;
  other_paid numeric;
  line_total numeric := 0;
  grouped_total numeric := 0;
begin
  if lower(coalesce(new.status, '')) <> 'paid' then return new; end if;

  for allocation in select key, value from jsonb_each_text(coalesce(new.allocations->'lines','{}'::jsonb))
  loop
    if coalesce(allocation.value::numeric,0) <= 0 then
      raise exception 'Payment allocation must be greater than zero: %', allocation.key;
    end if;
    line_total := line_total + allocation.value::numeric;
    old_has_same_line := false;
    old_line_value := null;
    if tg_op='UPDATE' and lower(coalesce(old.status,''))='paid' then
      old_has_same_line := coalesce(old.allocations->'lines','{}'::jsonb) ? allocation.key;
      if old_has_same_line then old_line_value := (old.allocations->'lines'->>allocation.key)::numeric; end if;
    end if;

    if allocation.key like 'salik-%' then
      line_id := substring(allocation.key from 7)::uuid;
      select amount, contract_id into item_amount, item_contract_id from public.salik where id=line_id for update;
      if not found then raise exception 'Salik transaction not found: %', line_id; end if;
      if item_contract_id is distinct from new.contract_id then raise exception 'Salik transaction belongs to another contract: %', line_id; end if;
      if not (old_has_same_line and abs(coalesce(old_line_value,0)-allocation.value::numeric)<0.009)
         and abs(allocation.value::numeric-item_amount)>0.009 then
        raise exception 'Salik allocation must equal the transaction amount for %', line_id;
      end if;
      if not old_has_same_line and exists (
        select 1 from public.payments p
        where p.id is distinct from new.id and p.contract_id=new.contract_id
          and lower(coalesce(p.status,''))='paid'
          and coalesce(p.allocations->'lines','{}'::jsonb) ? allocation.key
      ) then raise exception 'Salik transaction is already paid: %', line_id; end if;

    elsif allocation.key like 'fine-%' then
      line_id := substring(allocation.key from 6)::uuid;
      select amount, contract_id into item_amount, item_contract_id from public.fines where id=line_id for update;
      if not found then raise exception 'Fine not found: %', line_id; end if;
      if item_contract_id is distinct from new.contract_id then raise exception 'Fine belongs to another contract: %', line_id; end if;
      select coalesce(sum((p.allocations->'lines'->>allocation.key)::numeric),0) into other_paid
      from public.payments p where p.id is distinct from new.id and p.contract_id=new.contract_id
        and lower(coalesce(p.status,''))='paid' and coalesce(p.allocations->'lines','{}'::jsonb) ? allocation.key;
      if other_paid + allocation.value::numeric > item_amount + 0.009 then raise exception 'Fine allocation exceeds outstanding amount: %', line_id; end if;

    elsif allocation.key like 'fee-%' then
      line_id := substring(allocation.key from 5)::uuid;
      select amount, contract_id into item_amount, item_contract_id from public.contract_fees where id=line_id for update;
      if not found then raise exception 'Contract fee not found: %', line_id; end if;
      if item_contract_id is distinct from new.contract_id then raise exception 'Contract fee belongs to another contract: %', line_id; end if;
      select coalesce(sum((p.allocations->'lines'->>allocation.key)::numeric),0) into other_paid
      from public.payments p where p.id is distinct from new.id and p.contract_id=new.contract_id
        and lower(coalesce(p.status,''))='paid' and coalesce(p.allocations->'lines','{}'::jsonb) ? allocation.key;
      if other_paid + allocation.value::numeric > item_amount + 0.009 then raise exception 'Fee allocation exceeds outstanding amount: %', line_id; end if;

    elsif allocation.key like 'rental-%' then
      line_id := substring(allocation.key from 8)::uuid;
      if line_id is distinct from new.contract_id then raise exception 'Rental allocation belongs to another contract: %', line_id; end if;
      select total_amount into item_amount from public.contracts where id=line_id;
      if not found then raise exception 'Contract not found: %', line_id; end if;
      select coalesce(sum((p.allocations->'lines'->>allocation.key)::numeric),0) into other_paid
      from public.payments p where p.id is distinct from new.id and p.contract_id=new.contract_id
        and lower(coalesce(p.status,''))='paid' and coalesce(p.allocations->'lines','{}'::jsonb) ? allocation.key;
      if other_paid + allocation.value::numeric > item_amount + 0.009 then raise exception 'Rental allocation exceeds outstanding amount: %', line_id; end if;
    else
      raise exception 'Unknown payment allocation reference: %', allocation.key;
    end if;
  end loop;

  grouped_total := coalesce((new.allocations->>'rental')::numeric,0)+coalesce((new.allocations->>'fines')::numeric,0)+coalesce((new.allocations->>'salik')::numeric,0)+coalesce((new.allocations->>'fees')::numeric,0);
  if abs(line_total-new.amount)>0.009 then raise exception 'Payment amount must equal allocated line total'; end if;
  if abs(grouped_total-new.amount)>0.009 then raise exception 'Payment category totals must equal payment amount'; end if;
  if line_total<=0 then raise exception 'Paid payment must be allocated to at least one charge'; end if;
  return new;
end;
$$;