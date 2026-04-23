-- Fines: add import-related columns
ALTER TABLE public.fines
  ADD COLUMN IF NOT EXISTS fine_number text,
  ADD COLUMN IF NOT EXISTS original_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS fines_owner_fine_number_unique
  ON public.fines (owner_id, fine_number)
  WHERE fine_number IS NOT NULL;

-- Salik: add import-related columns
ALTER TABLE public.salik
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS tag_number text,
  ADD COLUMN IF NOT EXISTS toll_gate text,
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS original_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS salik_owner_transaction_id_unique
  ON public.salik (owner_id, transaction_id)
  WHERE transaction_id IS NOT NULL;