drop policy if exists "Authenticated update legacy client documents" on storage.objects;

create policy "Authenticated update legacy client documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = 'client-documents'
)
with check (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = 'client-documents'
);
