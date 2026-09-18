create table if not exists public.auto_sales_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  captured_at timestamptz not null,
  message_id text not null unique,
  contact_phone text not null,
  direction text not null check (direction in ('INBOUND','OUTBOUND')),
  event_field text not null,
  message_type text,
  text_body text,
  waba_id text not null,
  business_phone_number_id text,
  display_phone_number text,
  ad_id text,
  ctwa_clid text,
  raw_message jsonb not null default '{}'::jsonb,
  raw_change jsonb not null default '{}'::jsonb
);

create index if not exists auto_sales_whatsapp_messages_contact_phone_idx
  on public.auto_sales_whatsapp_messages(contact_phone, captured_at desc);

create index if not exists auto_sales_whatsapp_messages_ad_id_idx
  on public.auto_sales_whatsapp_messages(ad_id, captured_at desc)
  where ad_id is not null;

alter table public.auto_sales_whatsapp_messages enable row level security;

comment on table public.auto_sales_whatsapp_messages is
  'Service-role-only Meta webhook mirror for Auto Sales WhatsApp inbound messages and WhatsApp Business App echoes. Used as a reliability fallback when Peach CoPilot misses coexistence messages.';

insert into public.auto_sales_whatsapp_messages (
  captured_at,
  message_id,
  contact_phone,
  direction,
  event_field,
  message_type,
  text_body,
  waba_id,
  business_phone_number_id,
  display_phone_number,
  ad_id,
  ctwa_clid,
  raw_message,
  raw_change
)
select
  a.captured_at,
  a.message_id,
  a.contact_phone,
  'INBOUND',
  'messages',
  nullif(a.raw_message->>'type', ''),
  nullif(a.raw_message #>> '{text,body}', ''),
  a.waba_id,
  a.business_phone_number_id,
  a.display_phone_number,
  a.ad_id,
  a.ctwa_clid,
  a.raw_message,
  jsonb_build_object('backfill_source', 'auto_sales_whatsapp_attribution')
from public.auto_sales_whatsapp_attribution a
on conflict (message_id) do nothing;
