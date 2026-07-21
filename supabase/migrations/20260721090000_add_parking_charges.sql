create table if not exists public.parking_charges (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  parking_date timestamp with time zone not null,
  plate_number text,
  tag_number text,
  location text not null,
  parking_zone text,
  amount numeric not null default 0,
  status text not null default 'Unpaid',
  source text not null default 'Salik Statement PDF',
  source_key text not null,
  owner_id uuid not null default auth.uid(),
  created_at timestamp with time zone not null default now(),
  paid_at timestamp with time zone,
  notes text,
  constraint parking_charges_amount_nonnegative check (amount >= 0),
  constraint parking_charges_owner_source_key_unique unique (owner_id, source_key)
);

create index if not exists parking_charges_owner_date_idx
  on public.parking_charges(owner_id, parking_date desc);
create index if not exists parking_charges_contract_idx
  on public.parking_charges(contract_id);
create index if not exists parking_charges_car_date_idx
  on public.parking_charges(car_id, parking_date);

alter table public.parking_charges enable row level security;

drop policy if exists "Owners view parking charges" on public.parking_charges;
create policy "Owners view parking charges"
  on public.parking_charges for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Owners insert parking charges" on public.parking_charges;
create policy "Owners insert parking charges"
  on public.parking_charges for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Owners update parking charges" on public.parking_charges;
create policy "Owners update parking charges"
  on public.parking_charges for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owners delete parking charges" on public.parking_charges;
create policy "Owners delete parking charges"
  on public.parking_charges for delete to authenticated
  using (auth.uid() = owner_id);
