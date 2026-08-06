create or replace function public.reconcile_fines_after_vehicle_timeline_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_contract_id uuid;
  fine_record record;
  target_contract_id uuid;
  target_client_id uuid;
begin
  affected_contract_id := coalesce(new.contract_id, old.contract_id);

  for fine_record in
    select f.id, f.car_id, f.fine_date, f.owner_id
    from public.fines f
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
      )
  loop
    select c.id, c.client_id
      into target_contract_id, target_client_id
    from public.contract_vehicles cv
    join public.contracts c on c.id = cv.contract_id
    where cv.car_id = fine_record.car_id
      and c.owner_id = fine_record.owner_id
      and fine_record.fine_date >= greatest(
        cv.started_at,
        c.start_date::timestamp at time zone 'Asia/Dubai'
      )
      and fine_record.fine_date <= least(
        coalesce(cv.ended_at, c.end_date::timestamp + interval '1 day' - interval '1 millisecond'),
        c.end_date::timestamp + interval '1 day' - interval '1 millisecond'
      )
    order by cv.started_at desc
    limit 1;

    if target_contract_id is not null then
      update public.fines
      set contract_id = target_contract_id,
          client_id = target_client_id,
          is_company_expense = false
      where id = fine_record.id;
    else
      update public.fines
      set contract_id = null,
          client_id = null,
          is_company_expense = true
      where id = fine_record.id;
    end if;

    target_contract_id := null;
    target_client_id := null;
  end loop;

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
