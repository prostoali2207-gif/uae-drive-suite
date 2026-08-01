CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  role text NOT NULL CHECK (role IN ('manager', 'driver', 'accountant', 'cleaner', 'other')),
  phone text,
  email text,
  emirates_id text,
  passport_number text,
  license_number text,
  license_expiry date,
  signature text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_owner_status_idx ON public.staff (owner_id, status);
CREATE INDEX IF NOT EXISTS staff_owner_name_idx ON public.staff (owner_id, full_name);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view own staff" ON public.staff;
CREATE POLICY "Owners can view own staff"
  ON public.staff FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert own staff" ON public.staff;
CREATE POLICY "Owners can insert own staff"
  ON public.staff FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update own staff" ON public.staff;
CREATE POLICY "Owners can update own staff"
  ON public.staff FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.set_staff_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_staff_updated_at ON public.staff;
CREATE TRIGGER set_staff_updated_at
BEFORE UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.set_staff_updated_at();
