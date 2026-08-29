create table if not exists public.ai_storage_bridge_config (
  singleton boolean primary key default true check (singleton),
  hmac_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table public.ai_storage_bridge_config enable row level security;
revoke all on table public.ai_storage_bridge_config from anon, authenticated;
grant select on table public.ai_storage_bridge_config to service_role;

insert into public.ai_storage_bridge_config (singleton)
values (true)
on conflict (singleton) do nothing;
