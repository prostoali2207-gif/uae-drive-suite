create table if not exists public.auto_sales_whatsapp_attribution (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  captured_at timestamptz not null,
  message_id text not null unique,
  contact_phone text not null,
  waba_id text not null,
  business_phone_number_id text,
  display_phone_number text,
  source_type text,
  source_id text not null,
  ad_id text,
  source_url text,
  headline text,
  body text,
  media_type text,
  ctwa_clid text,
  lead_id text,
  experiment_id text,
  confidence text not null default 'DETERMINISTIC'
    check (confidence in ('DETERMINISTIC','CORROBORATED','SELF_REPORTED','INFERRED','UNKNOWN')),
  raw_referral jsonb not null default '{}'::jsonb,
  raw_message jsonb not null default '{}'::jsonb
);

create index if not exists auto_sales_whatsapp_attribution_contact_phone_idx
  on public.auto_sales_whatsapp_attribution(contact_phone, captured_at desc);
create index if not exists auto_sales_whatsapp_attribution_source_id_idx
  on public.auto_sales_whatsapp_attribution(source_id, captured_at desc);
create index if not exists auto_sales_whatsapp_attribution_ad_id_idx
  on public.auto_sales_whatsapp_attribution(ad_id, captured_at desc)
  where ad_id is not null;

alter table public.auto_sales_whatsapp_attribution enable row level security;

comment on table public.auto_sales_whatsapp_attribution is
  'Deterministic Click-to-WhatsApp attribution captured from Meta inbound referral payloads for Auto Sales. Service-role only; no public RLS policies.';
