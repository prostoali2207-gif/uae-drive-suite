create or replace function public.enforce_fine_contract_rental_period()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  linked_contract public.contracts%rowtype;
  contract_start_at timestamptz;
  contract_end_at timestamptz;
  has_vehicle_history boolean;
  vehicle_matches boolean;
begin
  if new.contract_id is null then
    new.client_id := null;
    return new;
  end if;

  select * into linked_contract
  from public.contracts
  where id = new.contract_id and owner_id = new.owner_id;

  if not found or new.car_id is null or new.fine_date is null then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  contract_start_at := (linked_contract.start_date::text || ' ' || coalesce(linked_contract.start_time::text, '00:00:00'))::timestamp at time zone 'Asia/Dubai';
  contract_end_at := (linked_contract.end_date::text || ' ' || coalesce(linked_contract.end_time::text, '23:59:59'))::timestamp at time zone 'Asia/Dubai';

  if new.fine_date < contract_start_at or new.fine_date > contract_end_at then
    new.contract_id := null;
    new.client_id := null;
    return new;
  end if;

  select exists (select 1 from public.contract_vehicles cv where cv.contract_id = linked_contract.id)
  into has_vehicle_history;

  if has_vehicle_history then
    select exists (
      select 1 from public.contract_vehicles cv
      where cv.contract_id = linked_contract.id
        and cv.car_id = new.car_id
        and new.fine_date >= cv.started_at
        and new.fine_date <= least(coalesce(cv.ended_at, contract_end_at), contract_end_at)
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
$function$;

drop trigger if exists trg_enforce_fine_contract_rental_period on public.fines;
create trigger trg_enforce_fine_contract_rental_period
before insert or update of contract_id, client_id, car_id, fine_date
on public.fines
for each row
execute function public.enforce_fine_contract_rental_period();

with candidates as (
  select f.id as fine_id,
         (array_agg(c.id order by c.id))[1] as contract_id,
         (array_agg(c.client_id order by c.id))[1] as client_id,
         count(distinct c.id) as candidate_count
  from public.fines f
  join public.contracts c
    on c.owner_id = f.owner_id
   and c.car_id = f.car_id
   and f.fine_date >= ((c.start_date + coalesce(c.start_time, time '00:00')) at time zone 'Asia/Dubai')
   and f.fine_date <= ((c.end_date + coalesce(c.end_time, time '23:59:59')) at time zone 'Asia/Dubai')
  where f.contract_id is null
    and f.car_id is not null
    and (
      not exists (select 1 from public.contract_vehicles cv0 where cv0.contract_id = c.id)
      or exists (
        select 1 from public.contract_vehicles cv
        where cv.contract_id = c.id
          and cv.car_id = f.car_id
          and f.fine_date >= cv.started_at
          and f.fine_date <= least(
            coalesce(cv.ended_at, ((c.end_date + coalesce(c.end_time, time '23:59:59')) at time zone 'Asia/Dubai')),
            ((c.end_date + coalesce(c.end_time, time '23:59:59')) at time zone 'Asia/Dubai')
          )
      )
    )
  group by f.id
)
update public.fines f
set contract_id = c.contract_id,
    client_id = c.client_id
from candidates c
where f.id = c.fine_id
  and c.candidate_count = 1;
