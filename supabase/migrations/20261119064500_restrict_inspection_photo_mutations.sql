-- Restrict inspection-photo mutations to the owner of the contract in the first path segment.
-- Existing upload paths use <contract_uuid>/...; legacy unlinked objects remain untouched.
DROP POLICY IF EXISTS "Authenticated users can delete inspection photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update inspection photos" ON storage.objects;
CREATE POLICY "Contract owners delete inspection photos" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'inspection-photos' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(name, '/', 1) AND c.owner_id = (SELECT auth.uid())
));
CREATE POLICY "Contract owners update inspection photos" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'inspection-photos' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(name, '/', 1) AND c.owner_id = (SELECT auth.uid())
))
WITH CHECK (bucket_id = 'inspection-photos' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(name, '/', 1) AND c.owner_id = (SELECT auth.uid())
));