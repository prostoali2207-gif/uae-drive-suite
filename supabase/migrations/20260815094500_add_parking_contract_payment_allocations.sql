create or replace function public.validate_payment_allocations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocation record;
  item_id uuid;
  target_amount numeric;
  already_allocated numeric;
  line_total numeric := 0;
  rental_total numeric := 0;
  fees_total numeric := 0;
  fines_total numeric := 0;
  salik_total numeric := 0;
  parking_total numeric := 0;
  category text;
begin
  if lower(coalesce(new.status, '')) <> 'paid' then return new; end if;
  if new.contract_id is null then raise exception 'Paid payment must belong to a contract'; end if;
  if jsonb_typeof(coalesce(new.allocations -> 'lines', '{}'::jsonb)) <> 'object' then
    raise exception 'Payment allocations.lines must be an object';
  end if;

  for allocation in select key, value from jsonb_each_text(coalesce(new.allocations -> 'lines', '{}'::jsonb)) loop
    if coalesce(allocation.value::numeric, 0) <= 0 then raise exception 'Payment allocation must be greater than zero: %', allocation.key; end if;
    line_total := line_total + allocation.value::numeric;

    if allocation.key like 'rental-%' then
      category := 'rental';
      begin item_id := substring(allocation.key from 8)::uuid; exception when others then raise exception 'Invalid rental allocation reference: %', allocation.key; end;
      if item_id is distinct from new.contract_id then raise exception 'Rental allocation belongs to another contract: %', item_id; end if;
      select total_amount into target_amount from public.contracts where id = item_id;
      if not found then raise exception 'Contract not found: %', item_id; end if;
      rental_total := rental_total + allocation.value::numeric;
    elsif allocation.key like 'fee-%' then
      category := 'fees';
      begin item_id := substring(allocation.key from 5)::uuid; exception when others then raise exception 'Invalid fee allocation reference: %', allocation.key; end;
      select amount into target_amount from public.contract_fees where id = item_id and contract_id = new.contract_id;
      if not found then raise exception 'Fee not found in this contract: %', item_id; end if;
      if target_amount <= 0 then raise exception 'Zero-value fee cannot receive payment: %', item_id; end if;
      fees_total := fees_total + allocation.value::numeric;
    elsif allocation.key like 'fine-%' then
      category := 'fines';
      begin item_id := substring(allocation.key from 6)::uuid; exception when others then raise exception 'Invalid fine allocation reference: %', allocation.key; end;
      select amount into target_amount from public.fines where id = item_id and contract_id = new.contract_id;
      if not found then raise exception 'Fine not found in this contract: %', item_id; end if;
      fines_total := fines_total + allocation.value::numeric;
    elsif allocation.key like 'salik-%' then
      category := 'salik';
      begin item_id := substring(allocation.key from 7)::uuid; exception when others then raise exception 'Invalid Salik allocation reference: %', allocation.key; end;
      select amount into target_amount from public.salik where id = item_id and contract_id = new.contract_id for update;
      if not found then raise exception 'Salik transaction not found in this contract: %', item_id; end if;
      if abs(allocation.value::numeric - target_amount) > 0.009 then raise exception 'Salik must be paid in full for transaction %', item_id; end if;
      salik_total := salik_total + allocation.value::numeric;
    elsif allocation.key like 'parking-%' then
      category := 'parking';
      begin item_id := substring(allocation.key from 9)::uuid; exception when others then raise exception 'Invalid Parking allocation reference: %', allocation.key; end;
      select amount into target_amount from public.parking_charges where id = item_id and contract_id = new.contract_id for update;
      if not found then raise exception 'Parking charge not found in this contract: %', item_id; end if;
      parking_total := parking_total + allocation.value::numeric;
    else
      raise exception 'Unknown payment allocation type: %', allocation.key;
    end if;

    select coalesce(sum((entry.value)::numeric), 0) into already_allocated
    from public.payments p
    cross join lateral jsonb_each_text(coalesce(p.allocations -> 'lines', '{}'::jsonb)) entry
    where p.id is distinct from new.id and p.contract_id = new.contract_id
      and lower(coalesce(p.status, '')) = 'paid' and entry.key = allocation.key;

    if already_allocated + allocation.value::numeric > target_amount + 0.009 then
      raise exception 'Payment exceeds remaining amount for %', allocation.key;
    end if;
  end loop;

  if abs(line_total - new.amount) > 0.009 then raise exception 'Payment amount must equal allocated line total'; end if;
  if abs(coalesce((new.allocations ->> 'rental')::numeric, 0) - rental_total) > 0.009
    or abs(coalesce((new.allocations ->> 'fees')::numeric, 0) - fees_total) > 0.009
    or abs(coalesce((new.allocations ->> 'fines')::numeric, 0) - fines_total) > 0.009
    or abs(coalesce((new.allocations ->> 'salik')::numeric, 0) - salik_total) > 0.009
    or abs(coalesce((new.allocations ->> 'parking')::numeric, 0) - parking_total) > 0.009 then
    raise exception 'Payment category totals do not match allocation lines';
  end if;
  return new;
end;
$$;

create or replace function public.sync_charge_statuses_from_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line_key text;
  item_id uuid;
  paid_total numeric;
  charge_amount numeric;
begin
  for line_key in
    select distinct key
    from (
      select key from jsonb_each_text(coalesce(case when tg_op <> 'DELETE' then new.allocations -> 'lines' end, '{}'::jsonb))
      union all
      select key from jsonb_each_text(coalesce(case when tg_op <> 'INSERT' then old.allocations -> 'lines' end, '{}'::jsonb))
    ) affected
    where key like 'fine-%' or key like 'salik-%' or key like 'parking-%'
  loop
    if line_key like 'fine-%' then
      begin item_id := substring(line_key from 6)::uuid; exception when others then continue; end;
      select amount into charge_amount from public.fines where id = item_id;
      if not found then continue; end if;
      select coalesce(sum((e.value)::numeric),0) into paid_total
      from public.payments p cross join lateral jsonb_each_text(coalesce(p.allocations->'lines','{}'::jsonb)) e
      where lower(coalesce(p.status,''))='paid' and e.key=line_key;
      update public.fines
      set status = case when paid_total >= charge_amount - 0.009 then 'Paid' when paid_total > 0 then 'Partial' else 'Unpaid' end,
          paid_at = case when paid_total >= charge_amount - 0.009 then coalesce(paid_at, now()) else null end
      where id=item_id;
    elsif line_key like 'salik-%' then
      begin item_id := substring(line_key from 7)::uuid; exception when others then continue; end;
      select amount into charge_amount from public.salik where id = item_id;
      if not found then continue; end if;
      select coalesce(sum((e.value)::numeric),0) into paid_total
      from public.payments p cross join lateral jsonb_each_text(coalesce(p.allocations->'lines','{}'::jsonb)) e
      where lower(coalesce(p.status,''))='paid' and e.key=line_key;
      update public.salik
      set status = case when paid_total >= charge_amount - 0.009 then 'Paid' else 'Charged to Client' end,
          paid_at = case when paid_total >= charge_amount - 0.009 then coalesce(paid_at, now()) else null end
      where id=item_id;
    else
      begin item_id := substring(line_key from 9)::uuid; exception when others then continue; end;
      select amount into charge_amount from public.parking_charges where id = item_id;
      if not found then continue; end if;
      select coalesce(sum((e.value)::numeric),0) into paid_total
      from public.payments p cross join lateral jsonb_each_text(coalesce(p.allocations->'lines','{}'::jsonb)) e
      where lower(coalesce(p.status,''))='paid' and e.key=line_key;
      update public.parking_charges
      set status = case when paid_total >= charge_amount - 0.009 then 'Paid' when paid_total > 0 then 'Partial' else 'Unpaid' end,
          paid_at = case when paid_total >= charge_amount - 0.009 then coalesce(paid_at, now()) else null end
      where id=item_id;
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;
