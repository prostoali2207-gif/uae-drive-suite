-- Allow public registration submissions from browsers that already have a Supabase session.
-- This does not grant authenticated SELECT, UPDATE, or DELETE for public registration.

GRANT INSERT ON public.client_registration_requests TO authenticated;

CREATE POLICY "Authenticated can submit pending client requests"
  ON public.client_registration_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id IS NOT NULL
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
    AND created_client_id IS NULL
  );
