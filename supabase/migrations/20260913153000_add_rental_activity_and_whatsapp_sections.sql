create schema if not exists internal;
revoke all on schema internal from public;
revoke all on schema internal from anon;
revoke all on schema internal from authenticated;

create table if not exists public.rental_activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  car_id uuid references public.cars(id) on delete set null,
  event_type text not null check (event_type in ('rental_out','rental_in','vehicle_replacement')),
  event_at timestamptz not null default now(),
  source_table text not null,
  source_row_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rental_activity_events_owner_event_at_idx
  on public.rental_activity_events(owner_id, event_at desc);

create index if not exists rental_activity_events_contract_idx
  on public.rental_activity_events(contract_id, event_at desc);

alter table public.rental_activity_events enable row level security;

create table if not exists public.whatsapp_section_channels (
  phone_number_id text primary key,
  display_phone_number text,
  section text not null check (section in ('cars','contracts','clients','finance','handover')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_section_channels enable row level security;

create or replace function internal.log_contract_rental_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_status text;
begin
  previous_status := case when tg_op = 'UPDATE' then old.status else null end;

  if new.status in ('Active','Expiring Soon')
     and (tg_op = 'INSERT' or previous_status is distinct from new.status)
     and coalesce(previous_status, '') not in ('Active','Expiring Soon') then
    insert into public.rental_activity_events (
      owner_id, contract_id, car_id, event_type, event_at, source_table, source_row_id, details
    ) values (
      new.owner_id,
      new.id,
      new.car_id,
      'rental_out',
      now(),
      'contracts',
      new.id,
      jsonb_build_object(
        'status_from', previous_status,
        'status_to', new.status,
        'start_date', new.start_date,
        'start_time', new.start_time,
        'end_date', new.end_date,
        'end_time', new.end_time
      )
    );
  end if;

  if new.status in ('Closed','Completed','returned')
     and (tg_op = 'INSERT' or previous_status is distinct from new.status)
     and coalesce(previous_status, '') not in ('Closed','Completed','returned') then
    insert into public.rental_activity_events (
      owner_id, contract_id, car_id, event_type, event_at, source_table, source_row_id, details
    ) values (
      new.owner_id,
      new.id,
      new.car_id,
      'rental_in',
      now(),
      'contracts',
      new.id,
      jsonb_build_object(
        'status_from', previous_status,
        'status_to', new.status,
        'end_date', new.end_date,
        'end_time', new.end_time
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function internal.log_contract_rental_activity() from public;
revoke all on function internal.log_contract_rental_activity() from anon;
revoke all on function internal.log_contract_rental_activity() from authenticated;

drop trigger if exists trg_log_contract_rental_activity on public.contracts;
create trigger trg_log_contract_rental_activity
after insert or update of status
on public.contracts
for each row
execute function internal.log_contract_rental_activity();

create or replace function internal.log_vehicle_replacement_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_segment public.contract_vehicles%rowtype;
begin
  select cv.*
  into previous_segment
  from public.contract_vehicles cv
  where cv.contract_id = new.contract_id
    and cv.id <> new.id
    and cv.started_at <= new.started_at
  order by cv.started_at desc, cv.created_at desc
  limit 1;

  if new.replacement_reason is not null or previous_segment.id is not null then
    insert into public.rental_activity_events (
      owner_id, contract_id, car_id, event_type, event_at, source_table, source_row_id, details
    ) values (
      new.owner_id,
      new.contract_id,
      new.car_id,
      'vehicle_replacement',
      coalesce(new.started_at, now()),
      'contract_vehicles',
      new.id,
      jsonb_build_object(
        'from_car_id', previous_segment.car_id,
        'to_car_id', new.car_id,
        'replacement_reason', new.replacement_reason,
        'started_at', new.started_at
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function internal.log_vehicle_replacement_activity() from public;
revoke all on function internal.log_vehicle_replacement_activity() from anon;
revoke all on function internal.log_vehicle_replacement_activity() from authenticated;

drop trigger if exists trg_log_vehicle_replacement_activity on public.contract_vehicles;
create trigger trg_log_vehicle_replacement_activity
after insert
on public.contract_vehicles
for each row
execute function internal.log_vehicle_replacement_activity();
