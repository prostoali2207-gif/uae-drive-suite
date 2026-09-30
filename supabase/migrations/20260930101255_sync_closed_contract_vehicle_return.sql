create or replace function internal.sync_closed_contract_vehicle_return()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  return_at timestamptz;
  final_segment_id uuid;
begin
  if lower(coalesce(new.status, '')) not in ('closed', 'completed', 'returned') then
    return new;
  end if;

  if new.end_date is null then
    return new;
  end if;

  return_at := (
    new.end_date + coalesce(new.end_time, time '23:59:59')
  ) at time zone 'Asia/Dubai';

  select cv.id
    into final_segment_id
  from public.contract_vehicles cv
  where cv.contract_id = new.id
    and cv.owner_id = new.owner_id
    and cv.started_at <= return_at
  order by cv.started_at desc, cv.created_at desc
  limit 1;

  if final_segment_id is not null then
    update public.contract_vehicles
    set ended_at = return_at
    where id = final_segment_id
      and ended_at is distinct from return_at;
  end if;

  return new;
end;
$$;

revoke all on function internal.sync_closed_contract_vehicle_return() from public;
revoke all on function internal.sync_closed_contract_vehicle_return() from anon;
revoke all on function internal.sync_closed_contract_vehicle_return() from authenticated;

drop trigger if exists trg_sync_closed_contract_vehicle_return on public.contracts;
create trigger trg_sync_closed_contract_vehicle_return
after insert or update of status, end_date, end_time
on public.contracts
for each row
execute function internal.sync_closed_contract_vehicle_return();
