-- Pending public client registration requests.
-- Public /client-register writes here instead of creating active clients.

DROP POLICY IF EXISTS "Anon can register client for valid owner" ON public.clients;

CREATE TABLE IF NOT EXISTS public.client_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text,
  nationality text NOT NULL DEFAULT '',
  date_of_birth date,
  client_type text NOT NULL DEFAULT 'Resident',
  emirates_id text NOT NULL DEFAULT '',
  emirates_id_expiry date,
  passport_number text NOT NULL DEFAULT '',
  passport_expiry date,
  license_number text NOT NULL DEFAULT '',
  license_expiry date,
  passport_photo_url text,
  eid_front_url text,
  eid_back_url text,
  license_front_url text,
  license_back_url text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_registration_requests_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT client_registration_requests_type_check
    CHECK (client_type IN ('Resident', 'Tourist'))
);

CREATE INDEX IF NOT EXISTS idx_client_registration_requests_owner_status
  ON public.client_registration_requests(owner_id, status, created_at DESC);

ALTER TABLE public.client_registration_requests ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.client_registration_requests TO anon;
GRANT SELECT, UPDATE ON public.client_registration_requests TO authenticated;

CREATE POLICY "Anon can submit pending client requests"
  ON public.client_registration_requests
  FOR INSERT
  TO anon
  WITH CHECK (
    status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
    AND created_client_id IS NULL
  );

CREATE POLICY "Owners can view client requests"
  ON public.client_registration_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can update client requests"
  ON public.client_registration_requests
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
