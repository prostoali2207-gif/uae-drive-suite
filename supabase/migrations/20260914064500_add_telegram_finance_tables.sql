create table if not exists public.staff_telegram_accounts (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  telegram_user_id bigint not null unique,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_operation_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  actor_staff_id uuid not null references public.staff(id) on delete restrict,
  telegram_user_id bigint not null,
  idempotency_key text not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'applied', 'failed')),
  result jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create index if not exists idx_staff_telegram_accounts_user_status
  on public.staff_telegram_accounts (telegram_user_id, status);

create index if not exists idx_telegram_operation_requests_staff_created
  on public.telegram_operation_requests (actor_staff_id, created_at desc);

alter table public.staff_telegram_accounts enable row level security;
alter table public.telegram_operation_requests enable row level security;

revoke all on public.staff_telegram_accounts from anon, authenticated;
revoke all on public.telegram_operation_requests from anon, authenticated;
