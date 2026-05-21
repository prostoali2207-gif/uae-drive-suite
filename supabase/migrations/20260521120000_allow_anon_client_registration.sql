-- Public client self-registration (/client-register)
--
-- Problem: clients INSERT is restricted to authenticated users with auth.uid() = owner_id.
-- ClientRegisterV2 runs as anon and passes owner_id from the registration link.
--
-- Fix: allow anon INSERT only when owner_id references an existing operator (profiles.id).
-- Uses SECURITY DEFINER so anon does not need direct SELECT on profiles.

CREATE OR REPLACE FUNCTION public.is_valid_owner(_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _owner_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_valid_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_owner(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Anon can register client for valid owner" ON public.clients;

CREATE POLICY "Anon can register client for valid owner"
  ON public.clients
  FOR INSERT
  TO anon
  WITH CHECK (public.is_valid_owner(owner_id));
