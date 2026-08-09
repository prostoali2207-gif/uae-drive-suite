alter table public.profiles
  add column if not exists parking_fee_type text not null default 'fixed',
  add column if not exists parking_fee_value numeric not null default 0;

alter table public.profiles
  drop constraint if exists profiles_parking_fee_type_check;

alter table public.profiles
  add constraint profiles_parking_fee_type_check
  check (parking_fee_type in ('fixed', 'percentage'));

alter table public.profiles
  drop constraint if exists profiles_parking_fee_value_nonnegative;

alter table public.profiles
  add constraint profiles_parking_fee_value_nonnegative
  check (parking_fee_value >= 0);

alter table public.parking_charges
  add column if not exists original_amount numeric,
  add column if not exists service_fee numeric not null default 0;

alter table public.parking_charges
  drop constraint if exists parking_charges_service_fee_nonnegative;

alter table public.parking_charges
  add constraint parking_charges_service_fee_nonnegative
  check (service_fee >= 0);
