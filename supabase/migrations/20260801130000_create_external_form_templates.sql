create table if not exists public.external_form_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  category text not null check (category in ('fines', 'impound', 'police', 'other')),
  emirate text,
  authority text,
  description text,
  recipient_email text,
  storage_path text not null,
  original_file_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.external_form_templates enable row level security;

create policy "Users view own external form templates"
on public.external_form_templates for select
to authenticated
using (owner_id = auth.uid());

create policy "Users add own external form templates"
on public.external_form_templates for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users update own external form templates"
on public.external_form_templates for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users delete own external form templates"
on public.external_form_templates for delete
to authenticated
using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('external-form-templates', 'external-form-templates', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Users view own external form files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'external-form-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users upload own external form files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'external-form-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users update own external form files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'external-form-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'external-form-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users delete own external form files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'external-form-templates'
  and (storage.foldername(name))[1] = auth.uid()::text
);
