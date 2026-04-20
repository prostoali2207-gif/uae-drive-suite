-- Function to compute the correct status based on end_date
CREATE OR REPLACE FUNCTION public.compute_contract_status(_end_date date, _current_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Preserve manually-set terminal statuses
  IF _current_status IN ('Cancelled') THEN
    RETURN _current_status;
  END IF;

  IF _end_date < CURRENT_DATE THEN
    RETURN 'Completed';
  ELSIF _end_date <= CURRENT_DATE + INTERVAL '7 days' THEN
    RETURN 'Expiring Soon';
  ELSE
    RETURN 'Active';
  END IF;
END;
$$;

-- Trigger function to set status on insert/update
CREATE OR REPLACE FUNCTION public.set_contract_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.status := public.compute_contract_status(NEW.end_date, COALESCE(NEW.status, 'Active'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_set_status ON public.contracts;
CREATE TRIGGER contracts_set_status
BEFORE INSERT OR UPDATE OF end_date, status ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.set_contract_status();

-- Function to refresh all contract statuses (used by scheduled job)
CREATE OR REPLACE FUNCTION public.refresh_contract_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contracts
  SET status = public.compute_contract_status(end_date, status)
  WHERE status <> public.compute_contract_status(end_date, status);
END;
$$;

-- Backfill existing rows now
SELECT public.refresh_contract_statuses();

-- Schedule daily refresh at 00:05 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-contract-statuses-daily') THEN
    PERFORM cron.unschedule('refresh-contract-statuses-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-contract-statuses-daily',
  '5 0 * * *',
  $$ SELECT public.refresh_contract_statuses(); $$
);