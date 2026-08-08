-- FleetDesk migration: keep the contract overview in sync with the active vehicle after replacement.
-- Vehicle history stays in contract_vehicles; contracts mirrors the active vehicle handover metrics
-- because ContractDetail renders initial_mileage and fuel_level from contracts.

create or replace function public.sync_contract_current_vehicle_handover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fuel_label text;
begin
  if new.ended_at is not null then
    return new;
  end if;

  fuel_label := case new.start_fuel_level
    when 0 then 'Empty'
    when 25 then 'Quarter'
    when 50 then 'Half'
    when 75 then 'Three Quarters'
    when 100 then 'Full'
    else null
  end;

  update public.contracts
  set
    initial_mileage = coalesce(new.start_mileage, initial_mileage),
    fuel_level = coalesce(fuel_label, fuel_level)
  where id = new.contract_id
    and car_id = new.car_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_contract_current_vehicle_handover
  on public.contract_vehicles;

create trigger trg_sync_contract_current_vehicle_handover
after insert or update of car_id, start_mileage, start_fuel_level, ended_at
on public.contract_vehicles
for each row
execute function public.sync_contract_current_vehicle_handover();

-- Repair existing contracts where the active vehicle already has handover values.
update public.contracts c
set
  initial_mileage = coalesce(cv.start_mileage, c.initial_mileage),
  fuel_level = coalesce(
    case cv.start_fuel_level
      when 0 then 'Empty'
      when 25 then 'Quarter'
      when 50 then 'Half'
      when 75 then 'Three Quarters'
      when 100 then 'Full'
      else null
    end,
    c.fuel_level
  )
from public.contract_vehicles cv
where cv.contract_id = c.id
  and cv.car_id = c.car_id
  and cv.ended_at is null
  and (cv.start_mileage is not null or cv.start_fuel_level is not null);
