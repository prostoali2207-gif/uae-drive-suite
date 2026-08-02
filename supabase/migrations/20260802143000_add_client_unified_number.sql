alter table public.clients
  add column if not exists unified_number text;

comment on column public.clients.unified_number is
  'UAE Unified Identification Number (UID) used for government traffic and immigration forms.';

create index if not exists clients_owner_unified_number_idx
  on public.clients (owner_id, unified_number)
  where unified_number is not null and unified_number <> '';
