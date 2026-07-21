create or replace function public.enforce_salik_contract_rental_period()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  linked_contract public.contracts%rowtype;
  salik_at timestamptz;
  contract_start_at timestamptz;
  contract_end_at timestamptz;
  has_vehicle_history boolean;
  vehicle_matches boolean;
begin
  if new.contract_id is null then
    new.client_id := null;
    return new;
  end if;

  select *
  into linked_contract
  from public.contracts
  where id = new.contract_id
    and owner_id = new.owner_id;

  if not found or new.car_id is null or new.charge_date is null then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  salik_at := (
    new.charge_date::text || ' ' || coalesce(nullif(new.trip_time, ''), '00:00')
  )::timestamp at time zone 'Asia/Dubai';

  contract_start_at := (
    linked_contract.start_date::text || ' ' || coalesce(linked_contract.start_time::text, '00:00:00')
  )::timestamp at time zone 'Asia/Dubai';

  contract_end_at := (
    linked_contract.end_date::text || ' ' || coalesce(linked_contract.end_time::text, '23:59:59')
  )::timestamp at time zone 'Asia/Dubai';

  if salik_at < contract_start_at or salik_at > contract_end_at then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  select exists (
    select 1 from public.contract_vehicles cv where cv.contract_id = linked_contract.id
  ) into has_vehicle_history;

  if has_vehicle_history then
    select exists (
      select 1
      from public.contract_vehicles cv
      where cv.contract_id = linked_contract.id
        and cv.car_id = new.car_id
        and salik_at >= cv.started_at
        and salik_at <= least(coalesce(cv.ended_at, contract_end_at), contract_end_at)
    ) into vehicle_matches;
  else
    vehicle_matches := linked_contract.car_id = new.car_id;
  end if;

  if not vehicle_matches then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  new.client_id := linked_contract.client_id;
  return new;
end;
$$;

drop trigger if exists trg_enforce_salik_contract_rental_period on public.salik;
create trigger trg_enforce_salik_contract_rental_period
before insert or update of contract_id, client_id, car_id, charge_date, trip_time
on public.salik
for each row
execute function public.enforce_salik_contract_rental_period();

create temporary table invalid_salik_links on commit drop as
select s.id
from public.salik s
join public.contracts c on c.id = s.contract_id
where s.contract_id is not null
  and (
    s.owner_id <> c.owner_id
    or s.car_id is null
    or s.charge_date is null
    or (
      (s.charge_date::text || ' ' || coalesce(nullif(s.trip_time, ''), '00:00'))::timestamp at time zone 'Asia/Dubai'
      < (c.start_date::text || ' ' || coalesce(c.start_time::text, '00:00:00'))::timestamp at time zone 'Asia/Dubai'
    )
    or (
      (s.charge_date::text || ' ' || coalesce(nullif(s.trip_time, ''), '00:00'))::timestamp at time zone 'Asia/Dubai'
      > (c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai'
    )
    or (
      exists (select 1 from public.contract_vehicles cv0 where cv0.contract_id = c.id)
      and not exists (
        select 1
        from public.contract_vehicles cv
        where cv.contract_id = c.id
          and cv.car_id = s.car_id
          and ((s.charge_date::text || ' ' || coalesce(nullif(s.trip_time, ''), '00:00'))::timestamp at time zone 'Asia/Dubai') >= cv.started_at
          and ((s.charge_date::text || ' ' || coalesce(nullif(s.trip_time, ''), '00:00'))::timestamp at time zone 'Asia/Dubai')
              <= least(
                coalesce(
                  cv.ended_at,
                  (c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai'
                ),
                (c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai'
              )
      )
    )
    or (
      not exists (select 1 from public.contract_vehicles cv0 where cv0.contract_id = c.id)
      and c.car_id <> s.car_id
    )
  );

update public.salik s
set contract_id = null,
    client_id = null
from invalid_salik_links i
where s.id = i.id;

with candidate_contracts as (
  select
    s.id as salik_id,
    c.id as contract_id,
    c.client_id,
    count(*) over (partition by s.id) as candidate_count,
    row_number() over (partition by s.id order by c.start_date desc, c.created_at desc, c.id) as candidate_rank
  from public.salik s
  join invalid_salik_links i on i.id = s.id
  join public.contracts c
    on c.owner_id = s.owner_id
   and s.car_id is not null
   and s.charge_date is not null
   and ((s.charge_date::text || ' ' || coalesce(nullif(s.trip_time, ''), '00:00'))::timestamp at time zone 'Asia/Dubai')
       between
       ((c.start_date::text || ' ' || coalesce(c.start_time::text, '00:00:00'))::timestamp at time zone 'Asia/Dubai')
       and
       ((c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai')
  where (
    (
      exists (select 1 from public.contract_vehicles cv0 where cv0.contract_id = c.id)
      and exists (
        select 1
        from public.contract_vehicles cv
        where cv.contract_id = c.id
          and cv.car_id = s.car_id
          and ((s.charge_date::text || ' ' || coalesce(nullif(s.trip_time, ''), '00:00'))::timestamp at time zone 'Asia/Dubai') >= cv.started_at
          and ((s.charge_date::text || ' ' || coalesce(nullif(s.trip_time, ''), '00:00'))::timestamp at time zone 'Asia/Dubai')
              <= least(
                coalesce(
                  cv.ended_at,
                  (c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai'
                ),
                (c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai'
              )
      )
    )
    or
    (
      not exists (select 1 from public.contract_vehicles cv0 where cv0.contract_id = c.id)
      and c.car_id = s.car_id
    )
  )
)
update public.salik s
set contract_id = cc.contract_id,
    client_id = cc.client_id
from candidate_contracts cc
where s.id = cc.salik_id
  and cc.candidate_count = 1
  and cc.candidate_rank = 1;
