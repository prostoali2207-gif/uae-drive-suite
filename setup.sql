-- FleetDesk complete schema + RLS + policies
-- Safe to run multiple times (uses IF NOT EXISTS / DROP POLICY IF EXISTS)

create extension if not exists pgcrypto;

-- =========================
-- TABLES
-- =========================

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null default '',
  company_name text not null default '',
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  plate text unique not null default '',
  make text not null default '',
  model text not null default '',
  year integer not null default 2024,
  status text not null default 'Available',
  insurance_expiry date,
  mulkiya_expiry date,
  tag_number text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  phone text not null default '',
  client_type text not null default 'Resident',
  emirates_id text default '',
  emirates_id_expiry date,
  passport_number text default '',
  passport_expiry date,
  nationality text not null default '',
  email text,
  license_number text not null default '',
  license_expiry date,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  car_id uuid not null references public.cars(id) on delete restrict,
  start_date date not null,
  start_time time not null default '12:00'::time,
  end_date date not null,
  end_time time not null default '12:00'::time,
  rate_type text not null default 'Daily',
  rate_amount numeric not null default 0,
  total_amount numeric not null default 0,
  deposit_amount numeric not null default 0,
  initial_mileage integer not null default 0,
  fuel_level text not null default 'Full',
  status text not null default 'Active',
  payment_status text not null default 'Unpaid',
  notes text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.fines (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  contract_id uuid,
  fine_date date not null,
  fine_type text not null default 'Other',
  fine_number text,
  amount numeric not null default 0,
  original_amount numeric not null default 0,
  service_fee numeric not null default 0,
  source text not null default '',
  status text not null default 'Unpaid',
  notes text,
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.salik (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  contract_id uuid,
  charge_date date not null,
  trips integer not null default 0,
  transaction_id text,
  tag_number text,
  toll_gate text,
  direction text,
  amount numeric not null default 0,
  original_amount numeric not null default 0,
  service_fee numeric not null default 0,
  status text not null default 'Unpaid',
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete restrict,
  amount numeric not null default 0,
  payment_date date not null,
  method text not null default 'Cash',
  status text not null default 'Paid',
  owner_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- =========================
-- INDEXES (from migrations)
-- =========================

create index if not exists idx_cars_tag_number on public.cars(tag_number);

create unique index if not exists fines_owner_fine_number_unique
  on public.fines (owner_id, fine_number)
  where fine_number is not null;

create unique index if not exists salik_owner_transaction_id_unique
  on public.salik (owner_id, transaction_id)
  where transaction_id is not null;

-- =========================
-- RLS ENABLE
-- =========================

alter table public.profiles enable row level security;
alter table public.cars enable row level security;
alter table public.clients enable row level security;
alter table public.contracts enable row level security;
alter table public.fines enable row level security;
alter table public.salik enable row level security;
alter table public.payments enable row level security;

-- =========================
-- PROFILES POLICIES
-- =========================

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can delete own profile" on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can delete own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

-- =========================
-- OWNER-SCOPED POLICIES
-- =========================

-- cars
drop policy if exists "Owners view cars" on public.cars;
drop policy if exists "Owners insert cars" on public.cars;
drop policy if exists "Owners update cars" on public.cars;
drop policy if exists "Owners delete cars" on public.cars;

create policy "Owners view cars"
  on public.cars for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Owners insert cars"
  on public.cars for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners update cars"
  on public.cars for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners delete cars"
  on public.cars for delete
  to authenticated
  using (auth.uid() = owner_id);

-- clients
drop policy if exists "Owners view clients" on public.clients;
drop policy if exists "Owners insert clients" on public.clients;
drop policy if exists "Owners update clients" on public.clients;
drop policy if exists "Owners delete clients" on public.clients;

create policy "Owners view clients"
  on public.clients for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Owners insert clients"
  on public.clients for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners update clients"
  on public.clients for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners delete clients"
  on public.clients for delete
  to authenticated
  using (auth.uid() = owner_id);

-- contracts
drop policy if exists "Owners view contracts" on public.contracts;
drop policy if exists "Owners insert contracts" on public.contracts;
drop policy if exists "Owners update contracts" on public.contracts;
drop policy if exists "Owners delete contracts" on public.contracts;

create policy "Owners view contracts"
  on public.contracts for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Owners insert contracts"
  on public.contracts for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners update contracts"
  on public.contracts for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners delete contracts"
  on public.contracts for delete
  to authenticated
  using (auth.uid() = owner_id);

-- fines
drop policy if exists "Owners view fines" on public.fines;
drop policy if exists "Owners insert fines" on public.fines;
drop policy if exists "Owners update fines" on public.fines;
drop policy if exists "Owners delete fines" on public.fines;

create policy "Owners view fines"
  on public.fines for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Owners insert fines"
  on public.fines for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners update fines"
  on public.fines for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners delete fines"
  on public.fines for delete
  to authenticated
  using (auth.uid() = owner_id);

-- salik
drop policy if exists "Owners view salik" on public.salik;
drop policy if exists "Owners insert salik" on public.salik;
drop policy if exists "Owners update salik" on public.salik;
drop policy if exists "Owners delete salik" on public.salik;

create policy "Owners view salik"
  on public.salik for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Owners insert salik"
  on public.salik for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners update salik"
  on public.salik for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners delete salik"
  on public.salik for delete
  to authenticated
  using (auth.uid() = owner_id);

-- payments
drop policy if exists "Owners view payments" on public.payments;
drop policy if exists "Owners insert payments" on public.payments;
drop policy if exists "Owners update payments" on public.payments;
drop policy if exists "Owners delete payments" on public.payments;

create policy "Owners view payments"
  on public.payments for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Owners insert payments"
  on public.payments for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners update payments"
  on public.payments for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners delete payments"
  on public.payments for delete
  to authenticated
  using (auth.uid() = owner_id);

-- =========================
-- NEW USER PROFILE TRIGGER
-- =========================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, company_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'company_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================
-- STORAGE BUCKET + POLICIES
-- =========================

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', false)
on conflict (id) do nothing;

drop policy if exists "Users view own logo" on storage.objects;
drop policy if exists "Users upload own logo" on storage.objects;
drop policy if exists "Users update own logo" on storage.objects;
drop policy if exists "Users delete own logo" on storage.objects;

create policy "Users view own logo"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'company-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users upload own logo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'company-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own logo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'company-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own logo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- =========================
-- VEHICLE STATUS SYNC
-- =========================

create or replace function public.sync_vehicle_status_for_car(_car_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  has_active_contract boolean;
begin
  if _car_id is null then
    return;
  end if;

  select exists(
    select 1
    from public.contracts c
    where c.car_id = _car_id
      and c.status in ('Active', 'Expiring Soon', 'Overdue')
  ) into has_active_contract;

  if has_active_contract then
    update public.cars
    set status = 'Rented'
    where id = _car_id
      and status is distinct from 'Rented';
  else
    update public.cars
    set status = 'Available'
    where id = _car_id
      and status = 'Rented';
  end if;
end;
$$;

create or replace function public.contracts_sync_vehicle_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_vehicle_status_for_car(new.car_id);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.car_id is distinct from new.car_id then
      perform public.sync_vehicle_status_for_car(old.car_id);
    end if;
    perform public.sync_vehicle_status_for_car(new.car_id);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.sync_vehicle_status_for_car(old.car_id);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists contracts_vehicle_status_sync on public.contracts;

create trigger contracts_vehicle_status_sync
after insert or update or delete on public.contracts
for each row
execute function public.contracts_sync_vehicle_status();

update public.cars
set status = 'Rented'
where id in (
  select distinct c.car_id
  from public.contracts c
  where c.status in ('Active', 'Expiring Soon', 'Overdue')
)
and status is distinct from 'Rented';

update public.cars car
set status = 'Available'
where car.status = 'Rented'
  and not exists (
    select 1
    from public.contracts c
    where c.car_id = car.id
      and c.status in ('Active', 'Expiring Soon', 'Overdue')
  );
