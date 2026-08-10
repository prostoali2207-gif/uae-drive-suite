create table if not exists public.external_form_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id uuid not null references public.external_form_templates(id) on delete restrict,
  fine_id uuid not null references public.fines(id) on delete restrict,
  contract_id uuid references public.contracts(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  recipient_email text not null,
  email_subject text not null,
  status text not null default 'ready' check (status in ('ready', 'sending', 'sent', 'failed')),
  package_storage_path text not null,
  package_file_name text not null,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, template_id, fine_id)
);

create index if not exists external_form_submissions_owner_status_idx
  on public.external_form_submissions (owner_id, status, created_at desc);

alter table public.external_form_submissions enable row level security;

create policy "Users view own external form submissions"
on public.external_form_submissions for select
to authenticated
using (owner_id = auth.uid());

create policy "Users add own external form submissions"
on public.external_form_submissions for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users update own external form submissions"
on public.external_form_submissions for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('external-form-submissions', 'external-form-submissions', false, 26214400, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Users view own external submission files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'external-form-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users upload own external submission files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'external-form-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users update own external submission files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'external-form-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'external-form-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users delete own external submission files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'external-form-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);
