ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_license_url text;
