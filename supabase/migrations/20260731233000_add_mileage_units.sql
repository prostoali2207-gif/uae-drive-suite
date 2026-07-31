alter table public.cars
  add column if not exists mileage_unit text not null default 'km'
  check (mileage_unit in ('km', 'mi'));

alter table public.contracts
  add column if not exists mileage_unit text not null default 'km'
  check (mileage_unit in ('km', 'mi'));

comment on column public.cars.mileage_unit is 'Vehicle odometer unit: km or mi';
comment on column public.contracts.mileage_unit is 'Mileage unit snapshot captured when contract is created';
