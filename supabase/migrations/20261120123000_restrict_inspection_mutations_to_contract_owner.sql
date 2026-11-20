-- Preserve the existing public inspection viewer, but prevent cross-owner changes.
DROP POLICY IF EXISTS "Authenticated users can manage inspections" ON public.contract_inspections;

CREATE POLICY "Contract owners insert inspections" ON public.contract_inspections
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.contracts c
          WHERE c.id = contract_id AND c.owner_id = (SELECT auth.uid()))
);

CREATE POLICY "Contract owners update inspections" ON public.contract_inspections
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.contracts c
              WHERE c.id = contract_id AND c.owner_id = (SELECT auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.contracts c
                   WHERE c.id = contract_id AND c.owner_id = (SELECT auth.uid())));

CREATE POLICY "Contract owners delete inspections" ON public.contract_inspections
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.contracts c
              WHERE c.id = contract_id AND c.owner_id = (SELECT auth.uid())));
