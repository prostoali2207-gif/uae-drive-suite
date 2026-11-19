-- PDF uploads must belong to a contract owned by the authenticated user.
-- Supports <contract_uuid>.pdf and <contract_uuid>/... paths.
DROP POLICY IF EXISTS "Auth upload contract-pdfs" ON storage.objects;
CREATE POLICY "Contract owners upload contract-pdfs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contract-pdfs' AND EXISTS (
 SELECT 1 FROM public.contracts c
 WHERE c.id::text = split_part(split_part(name, '/', 1), '.', 1)
 AND c.owner_id = (SELECT auth.uid())
));