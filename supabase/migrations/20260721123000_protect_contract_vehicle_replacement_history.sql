create unique index if not exists contract_vehicles_one_active_per_contract
on public.contract_vehicles (contract_id)
where ended_at is null;

create or replace function public.guard_contract_vehicle_replacement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.ended_at is null then
    perform pg_advisory_xact_lock(hashtextextended(new.contract_id::text, 0));

    if exists (
      select 1
      from public.contract_vehicles cv
      where cv.contract_id = new.contract_id
        and cv.id <> coalesce(new.id, gen_random_uuid())
        and cv.ended_at is null
    ) then
      raise exception 'Contract already has an active vehicle period';
    end if;

    if exists (
      select 1
      from public.contract_vehicles cv
      where cv.contract_id = new.contract_id
        and cv.car_id = new.car_id
        and cv.ended_at = new.started_at
    ) then
      raise exception 'Replacement vehicle must differ from the vehicle being closed';
    end if;

    update public.contracts
    set car_id = new.car_id
    where id = new.contract_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_contract_vehicle_replacement on public.contract_vehicles;
create trigger trg_guard_contract_vehicle_replacement
before insert or update of car_id, started_at, ended_at
on public.contract_vehicles
for each row
execute function public.guard_contract_vehicle_replacement();
