alter table public.cars
  add column if not exists mulkiya_pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-documents',
  'vehicle-documents',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users view own vehicle documents'
  ) then
    create policy "Users view own vehicle documents"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'vehicle-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users upload own vehicle documents'
  ) then
    create policy "Users upload own vehicle documents"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'vehicle-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users update own vehicle documents'
  ) then
    create policy "Users update own vehicle documents"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'vehicle-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'vehicle-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users delete own vehicle documents'
  ) then
    create policy "Users delete own vehicle documents"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'vehicle-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;
