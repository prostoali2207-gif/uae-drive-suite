create table if not exists public.contract_drivers (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  owner_id uuid not null default auth.uid(),
  position integer not null default 1 check (position > 0),
  signature text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contract_id, client_id)
);

create index if not exists contract_drivers_contract_id_idx
  on public.contract_drivers(contract_id);

create index if not exists contract_drivers_client_id_idx
  on public.contract_drivers(client_id);

alter table public.contract_drivers enable row level security;

create policy "Owners view contract drivers"
  on public.contract_drivers
  for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Owners insert contract drivers"
  on public.contract_drivers
  for insert
  to authenticated
  with check (
    auth.uid() = owner_id
    and exists (
      select 1
      from public.contracts c
      where c.id = contract_drivers.contract_id
        and c.owner_id = auth.uid()
        and c.client_id <> contract_drivers.client_id
    )
    and exists (
      select 1
      from public.clients cl
      where cl.id = contract_drivers.client_id
        and cl.owner_id = auth.uid()
    )
  );

create policy "Owners update contract drivers"
  on public.contract_drivers
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1
      from public.contracts c
      where c.id = contract_drivers.contract_id
        and c.owner_id = auth.uid()
        and c.client_id <> contract_drivers.client_id
    )
    and exists (
      select 1
      from public.clients cl
      where cl.id = contract_drivers.client_id
        and cl.owner_id = auth.uid()
    )
  );

create policy "Owners delete contract drivers"
  on public.contract_drivers
  for delete
  to authenticated
  using (auth.uid() = owner_id);
