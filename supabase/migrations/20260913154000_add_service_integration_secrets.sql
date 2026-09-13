create table if not exists public.service_integration_secrets (
  secret_name text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);

alter table public.service_integration_secrets enable row level security;

revoke all on public.service_integration_secrets from anon;
revoke all on public.service_integration_secrets from authenticated;
