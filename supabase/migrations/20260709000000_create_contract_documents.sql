CREATE TABLE IF NOT EXISTS public.contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  title text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'contract-pdfs',
  storage_path text NOT NULL,
  public_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_documents_document_type_check
    CHECK (
      document_type = ANY (
        ARRAY[
          'original_rental_agreement'::text,
          'vehicle_replacement_addendum'::text,
          'final_return_checkin'::text,
          'other'::text
        ]
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_contract_documents_contract_id
  ON public.contract_documents(contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_documents_owner_id
  ON public.contract_documents(owner_id);

CREATE INDEX IF NOT EXISTS idx_contract_documents_document_type
  ON public.contract_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_contract_documents_created_at
  ON public.contract_documents(created_at);

ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view contract_documents"
  ON public.contract_documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners insert contract_documents"
  ON public.contract_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners update contract_documents"
  ON public.contract_documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners delete contract_documents"
  ON public.contract_documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);
