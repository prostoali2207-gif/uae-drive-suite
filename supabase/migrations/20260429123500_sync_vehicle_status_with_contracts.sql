-- Keep cars.status in sync with contracts lifecycle

create or replace function public.sync_vehicle_status_for_car(_car_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  has_active_contract boolean;
begin
  if _car_id is null then
    return;
  end if;

  select exists(
    select 1
    from public.contracts c
    where c.car_id = _car_id
      and c.status in ('Active', 'Expiring Soon', 'Overdue')
  ) into has_active_contract;

  if has_active_contract then
    update public.cars
    set status = 'Rented'
    where id = _car_id
      and status is distinct from 'Rented';
  else
    update public.cars
    set status = 'Available'
    where id = _car_id
      and status = 'Rented';
  end if;
end;
$$;

create or replace function public.contracts_sync_vehicle_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_vehicle_status_for_car(new.car_id);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.car_id is distinct from new.car_id then
      perform public.sync_vehicle_status_for_car(old.car_id);
    end if;
    perform public.sync_vehicle_status_for_car(new.car_id);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.sync_vehicle_status_for_car(old.car_id);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists contracts_vehicle_status_sync on public.contracts;

create trigger contracts_vehicle_status_sync
after insert or update or delete on public.contracts
for each row
execute function public.contracts_sync_vehicle_status();

-- Backfill immediately: rent cars with active contracts
update public.cars
set status = 'Rented'
where id in (
  select distinct c.car_id
  from public.contracts c
  where c.status in ('Active', 'Expiring Soon', 'Overdue')
)
and status is distinct from 'Rented';

-- Release cars with no active contracts
update public.cars car
set status = 'Available'
where car.status = 'Rented'
  and not exists (
    select 1
    from public.contracts c
    where c.car_id = car.id
      and c.status in ('Active', 'Expiring Soon', 'Overdue')
  );

