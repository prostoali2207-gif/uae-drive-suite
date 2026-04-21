ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'Resident',
  ADD COLUMN IF NOT EXISTS emirates_id_expiry date,
  ADD COLUMN IF NOT EXISTS passport_expiry date;

ALTER TABLE public.clients
  ALTER COLUMN emirates_id DROP NOT NULL,
  ALTER COLUMN passport_number DROP NOT NULL;