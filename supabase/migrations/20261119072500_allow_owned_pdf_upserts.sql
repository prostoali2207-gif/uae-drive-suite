-- Existing signed PDFs are overwritten with upsert: true.
-- Restrict overwrite to the contract owner; public read remains unchanged pending UI migration.
CREATE POLICY "Contract owners update contract-pdfs" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'contract-pdfs' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(split_part(name, '/', 1), '.', 1)
 AND c.owner_id = (SELECT auth.uid())
))
WITH CHECK (bucket_id = 'contract-pdfs' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(split_part(name, '/', 1), '.', 1)
 AND c.owner_id = (SELECT auth.uid())
));