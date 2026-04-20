-- Add logo_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS logo_url text;

-- Add owner_id to all operational tables
ALTER TABLE public.cars ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.salik ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Backfill existing rows to first user (if any)
DO $$
DECLARE
  first_user uuid;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF first_user IS NOT NULL THEN
    UPDATE public.cars SET owner_id = first_user WHERE owner_id IS NULL;
    UPDATE public.clients SET owner_id = first_user WHERE owner_id IS NULL;
    UPDATE public.contracts SET owner_id = first_user WHERE owner_id IS NULL;
    UPDATE public.fines SET owner_id = first_user WHERE owner_id IS NULL;
    UPDATE public.salik SET owner_id = first_user WHERE owner_id IS NULL;
    UPDATE public.payments SET owner_id = first_user WHERE owner_id IS NULL;
  END IF;
END $$;

-- Default owner_id to current user on insert
ALTER TABLE public.cars ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.clients ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.contracts ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.fines ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.salik ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.payments ALTER COLUMN owner_id SET DEFAULT auth.uid();

-- Make owner_id NOT NULL
ALTER TABLE public.cars ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.clients ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.contracts ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.fines ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.salik ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN owner_id SET NOT NULL;

-- Drop old permissive policies and recreate scoped ones
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cars','clients','contracts','fines','salik','payments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Auth view %s" ON public.%s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Auth insert %s" ON public.%s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Auth update %s" ON public.%s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Auth delete %s" ON public.%s', t, t);

    EXECUTE format('CREATE POLICY "Owners view %s" ON public.%s FOR SELECT TO authenticated USING (auth.uid() = owner_id)', t, t);
    EXECUTE format('CREATE POLICY "Owners insert %s" ON public.%s FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id)', t, t);
    EXECUTE format('CREATE POLICY "Owners update %s" ON public.%s FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id)', t, t);
    EXECUTE format('CREATE POLICY "Owners delete %s" ON public.%s FOR DELETE TO authenticated USING (auth.uid() = owner_id)', t, t);
  END LOOP;
END $$;

-- Storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own logo"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own logo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own logo"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND auth.uid()::text = (storage.foldername(name))[1]);