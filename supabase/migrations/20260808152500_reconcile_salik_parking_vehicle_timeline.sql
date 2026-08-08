create or replace function public.resolve_vehicle_contract_at(
  p_owner_id uuid,
  p_car_id uuid,
  p_event_at timestamptz
)
returns table(contract_id uuid, client_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with timeline_match as (
    select c.id as contract_id, c.client_id, cv.started_at as sort_at
    from public.contract_vehicles cv
    join public.contracts c on c.id = cv.contract_id
    where c.owner_id = p_owner_id
      and cv.car_id = p_car_id
      and p_event_at >= greatest(
        cv.started_at,
        (c.start_date + coalesce(c.start_time, time '00:00:00')) at time zone 'Asia/Dubai'
      )
      and p_event_at <= least(
        coalesce(cv.ended_at, (c.end_date + coalesce(c.end_time, time '23:59:59.999999')) at time zone 'Asia/Dubai'),
        (c.end_date + coalesce(c.end_time, time '23:59:59.999999')) at time zone 'Asia/Dubai'
      )
    order by cv.started_at desc
    limit 1
  ), legacy_match as (
    select c.id as contract_id, c.client_id,
           (c.start_date + coalesce(c.start_time, time '00:00:00')) at time zone 'Asia/Dubai' as sort_at
    from public.contracts c
    where c.owner_id = p_owner_id
      and c.car_id = p_car_id
      and not exists (
        select 1 from public.contract_vehicles cv where cv.contract_id = c.id
      )
      and p_event_at >= (c.start_date + coalesce(c.start_time, time '00:00:00')) at time zone 'Asia/Dubai'
      and p_event_at <= (c.end_date + coalesce(c.end_time, time '23:59:59.999999')) at time zone 'Asia/Dubai'
    order by sort_at desc
    limit 1
  )
  select contract_id, client_id from timeline_match
  union all
  select contract_id, client_id from legacy_match
  where not exists (select 1 from timeline_match)
  limit 1;
$$;

create or replace function public.assign_salik_contract_from_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_at timestamptz;
  target_contract_id uuid;
  target_client_id uuid;
begin
  if new.car_id is null or new.owner_id is null or new.charge_date is null then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  event_at := (
    new.charge_date +
    case
      when coalesce(new.trip_time, '') ~ '^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
        then new.trip_time::time
      else time '00:00:00'
    end
  ) at time zone 'Asia/Dubai';

  select r.contract_id, r.client_id
    into target_contract_id, target_client_id
  from public.resolve_vehicle_contract_at(new.owner_id, new.car_id, event_at) r;

  new.contract_id := target_contract_id;
  new.client_id := target_client_id;

  if target_contract_id is null and new.status = 'Charged to Client' then
    new.status := 'Unpaid';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_salik_contract_from_timeline on public.salik;
create trigger trg_assign_salik_contract_from_timeline
before insert or update of owner_id, car_id, charge_date, trip_time, contract_id, client_id
on public.salik
for each row
execute function public.assign_salik_contract_from_timeline();

create or replace function public.assign_parking_contract_from_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_contract_id uuid;
  target_client_id uuid;
begin
  if new.car_id is null or new.owner_id is null or new.parking_date is null then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  select r.contract_id, r.client_id
    into target_contract_id, target_client_id
  from public.resolve_vehicle_contract_at(new.owner_id, new.car_id, new.parking_date) r;

  new.contract_id := target_contract_id;
  new.client_id := target_client_id;

  if target_contract_id is null and new.status = 'Charged to Client' then
    new.status := 'Unpaid';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_parking_contract_from_timeline on public.parking_charges;
create trigger trg_assign_parking_contract_from_timeline
before insert or update of owner_id, car_id, parking_date, contract_id, client_id
on public.parking_charges
for each row
execute function public.assign_parking_contract_from_timeline();

create or replace function public.reconcile_salik_parking_after_vehicle_timeline_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_owner_id uuid;
  affected_car_id uuid;
  row_record record;
  event_at timestamptz;
  target_contract_id uuid;
  target_client_id uuid;
begin
  affected_owner_id := coalesce(new.owner_id, old.owner_id);

  for affected_car_id in
    select distinct car_id
    from (values (case when tg_op <> 'DELETE' then new.car_id end),
                 (case when tg_op <> 'INSERT' then old.car_id end)) v(car_id)
    where car_id is not null
  loop
    for row_record in
      select s.id, s.charge_date, s.trip_time, s.status
      from public.salik s
      where s.owner_id = affected_owner_id and s.car_id = affected_car_id
    loop
      event_at := (
        row_record.charge_date +
        case
          when coalesce(row_record.trip_time, '') ~ '^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
            then row_record.trip_time::time
          else time '00:00:00'
        end
      ) at time zone 'Asia/Dubai';

      target_contract_id := null;
      target_client_id := null;
      select r.contract_id, r.client_id
        into target_contract_id, target_client_id
      from public.resolve_vehicle_contract_at(affected_owner_id, affected_car_id, event_at) r;

      update public.salik
      set contract_id = target_contract_id,
          client_id = target_client_id,
          status = case when target_contract_id is null and status = 'Charged to Client' then 'Unpaid' else status end
      where id = row_record.id
        and (contract_id is distinct from target_contract_id or client_id is distinct from target_client_id or (target_contract_id is null and status = 'Charged to Client'));
    end loop;

    for row_record in
      select p.id, p.parking_date, p.status
      from public.parking_charges p
      where p.owner_id = affected_owner_id and p.car_id = affected_car_id
    loop
      target_contract_id := null;
      target_client_id := null;
      select r.contract_id, r.client_id
        into target_contract_id, target_client_id
      from public.resolve_vehicle_contract_at(affected_owner_id, affected_car_id, row_record.parking_date) r;

      update public.parking_charges
      set contract_id = target_contract_id,
          client_id = target_client_id,
          status = case when target_contract_id is null and status = 'Charged to Client' then 'Unpaid' else status end
      where id = row_record.id
        and (contract_id is distinct from target_contract_id or client_id is distinct from target_client_id or (target_contract_id is null and status = 'Charged to Client'));
    end loop;
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_reconcile_salik_parking_after_vehicle_timeline_change on public.contract_vehicles;
create trigger trg_reconcile_salik_parking_after_vehicle_timeline_change
after insert or update of owner_id, car_id, started_at, ended_at, contract_id or delete
on public.contract_vehicles
for each row
execute function public.reconcile_salik_parking_after_vehicle_timeline_change();
