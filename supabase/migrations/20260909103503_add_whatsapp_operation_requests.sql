create table if not exists public.whatsapp_operation_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  actor_phone text not null,
  actor_type text not null check (actor_type in ('staff', 'client', 'unknown', 'system')),
  actor_staff_id uuid references public.staff(id) on delete set null,
  actor_client_id uuid references public.clients(id) on delete set null,
  action text not null,
  contract_id uuid references public.contracts(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'requested', 'applied', 'failed', 'rejected')),
  result jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists whatsapp_operation_requests_contract_created_idx
  on public.whatsapp_operation_requests (contract_id, created_at desc);

create index if not exists whatsapp_operation_requests_actor_phone_created_idx
  on public.whatsapp_operation_requests (actor_phone, created_at desc);

alter table public.whatsapp_operation_requests enable row level security;

revoke all on table public.whatsapp_operation_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_operation_requests to service_role;
