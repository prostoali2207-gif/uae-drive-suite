-- Internal vehicle timeline lookup must not be callable through the public Data API.
-- Trigger functions execute this lookup internally; their execution is unaffected.
REVOKE EXECUTE ON FUNCTION public.resolve_vehicle_contract_at(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
