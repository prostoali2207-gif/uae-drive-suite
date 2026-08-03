alter table public.cars
  add column if not exists plate_emirate text,
  add column if not exists registration_date date,
  add column if not exists chassis_number text;
