create or replace function public.reconcile_fines_after_vehicle_timeline_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_contract_id uuid;
begin
  affected_contract_id := coalesce(new.contract_id, old.contract_id);

  update public.fines f
  set contract_id = null,
      client_id = null
  where f.contract_id = affected_contract_id
    and not exists (
      select 1
      from public.contract_vehicles cv
      join public.contracts c on c.id = cv.contract_id
      where cv.contract_id = f.contract_id
        and cv.car_id = f.car_id
        and f.fine_date >= greatest(
          cv.started_at,
          c.start_date::timestamp at time zone 'Asia/Dubai'
        )
        and f.fine_date <= least(
          coalesce(cv.ended_at, c.end_date::timestamp + interval '1 day' - interval '1 millisecond'),
          c.end_date::timestamp + interval '1 day' - interval '1 millisecond'
        )
    );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_reconcile_fines_after_vehicle_timeline_change
on public.contract_vehicles;

create trigger trg_reconcile_fines_after_vehicle_timeline_change
after insert or update of car_id, started_at, ended_at, contract_id or delete
on public.contract_vehicles
for each row
execute function public.reconcile_fines_after_vehicle_timeline_change();
