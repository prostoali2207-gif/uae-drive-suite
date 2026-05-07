alter table public.contracts
  add column if not exists start_time time not null default '12:00'::time,
  add column if not exists end_time time not null default '12:00'::time;

