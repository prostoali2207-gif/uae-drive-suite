-- New inspection photos may only be uploaded into an owned contract folder.
DROP POLICY IF EXISTS "Authenticated users can upload inspection photos" ON storage.objects;
CREATE POLICY "Contract owners upload inspection photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inspection-photos' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(name, '/', 1) AND c.owner_id = (SELECT auth.uid())
));