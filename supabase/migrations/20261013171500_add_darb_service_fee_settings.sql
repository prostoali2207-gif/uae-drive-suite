-- Separate Darb service-fee settings, using the same validation and accounting rules as Salik.
-- Existing profiles retain a default fixed fee of AED 1; no historical charge is modified.
alter table public.profiles
  add column if not exists darb_fee_type text not null default 'fixed',
  add column if not exists darb_fee_value numeric not null default 1;

alter table public.profiles
  add constraint profiles_darb_fee_type_check check (darb_fee_type in ('fixed', 'percentage')),
  add constraint profiles_darb_fee_value_check check (darb_fee_value >= 0);

comment on column public.profiles.darb_fee_value is 'Darb import service fee, separate from Salik; default 1 AED per toll';
