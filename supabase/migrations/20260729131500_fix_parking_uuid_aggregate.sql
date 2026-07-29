create or replace function public.enforce_parking_contract_rental_period()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parking_at timestamptz;
  linked_contract public.contracts%rowtype;
  candidate_id uuid;
  candidate_client_id uuid;
  candidate_count integer;
  contract_start_at timestamptz;
  contract_end_at timestamptz;
  has_vehicle_history boolean;
  vehicle_matches boolean;
begin
  if new.car_id is null or new.parking_date is null then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  parking_at := new.parking_date;

  if new.contract_id is null then
    select count(*),
           (array_agg(q.contract_id order by q.contract_id))[1],
           (array_agg(q.client_id order by q.contract_id))[1]
      into candidate_count, candidate_id, candidate_client_id
    from (
      select c.id as contract_id, c.client_id
      from public.contracts c
      where c.owner_id = new.owner_id
        and parking_at >= ((c.start_date::text || ' ' || coalesce(c.start_time::text, '00:00:00'))::timestamp at time zone 'Asia/Dubai')
        and parking_at <= ((c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai')
        and (
          (
            exists (select 1 from public.contract_vehicles cv0 where cv0.contract_id = c.id)
            and exists (
              select 1
              from public.contract_vehicles cv
              where cv.contract_id = c.id
                and cv.car_id = new.car_id
                and parking_at >= cv.started_at
                and parking_at <= least(
                  coalesce(cv.ended_at, ((c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai')),
                  ((c.end_date::text || ' ' || coalesce(c.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai')
                )
            )
          )
          or (
            not exists (select 1 from public.contract_vehicles cv0 where cv0.contract_id = c.id)
            and c.car_id = new.car_id
          )
        )
    ) q;

    if candidate_count = 1 then
      new.contract_id := candidate_id;
      new.client_id := candidate_client_id;
    else
      new.contract_id := null;
      new.client_id := null;
    end if;

    return new;
  end if;

  select * into linked_contract
  from public.contracts
  where id = new.contract_id and owner_id = new.owner_id;

  if not found then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  contract_start_at := ((linked_contract.start_date::text || ' ' || coalesce(linked_contract.start_time::text, '00:00:00'))::timestamp at time zone 'Asia/Dubai');
  contract_end_at := ((linked_contract.end_date::text || ' ' || coalesce(linked_contract.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai');

  if parking_at < contract_start_at or parking_at > contract_end_at then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  select exists(select 1 from public.contract_vehicles cv where cv.contract_id = linked_contract.id)
    into has_vehicle_history;

  if has_vehicle_history then
    select exists(
      select 1
      from public.contract_vehicles cv
      where cv.contract_id = linked_contract.id
        and cv.car_id = new.car_id
        and parking_at >= cv.started_at
        and parking_at <= least(coalesce(cv.ended_at, contract_end_at), contract_end_at)
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
