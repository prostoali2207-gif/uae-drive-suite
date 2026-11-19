-- Prepare private PDF access without removing the current public read path.
-- Existing PDF paths are <contract_uuid>.pdf or <contract_uuid>/...
CREATE POLICY "Contract owners read contract-pdfs" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'contract-pdfs' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(split_part(name, '/', 1), '.', 1)
 AND c.owner_id = (SELECT auth.uid())
));
-- Inspection photos are stored under <contract_uuid>/...
CREATE POLICY "Contract owners read inspection photos" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'inspection-photos' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(name, '/', 1)
 AND c.owner_id = (SELECT auth.uid())
));
-- Public read policies and public bucket flags remain in place until UI is migrated.
