-- Verified historic Salik reconciliation (2026-10-18).
-- Only restore Paid status when the same contract has an exact, fully paid
-- per-transaction allocation. Four unlinked June 6 charges are intentionally excluded.
-- No financial amount, payment, contract assignment, or paid_at timestamp is changed.
-- Preflight count and sum prevent accidental wider updates.
do $$
declare
  expected_count integer;
  expected_total numeric;
  changed_count integer;
begin
  select count(*), coalesce(sum(s.amount),0)
  into expected_count, expected_total
  from public.salik s
  where s.status = 'Unpaid'
    and s.paid_at is not null
    and s.contract_id is not null
    and exists (
      select 1
      from public.payments p
      where p.contract_id = s.contract_id
        and p.owner_id = s.owner_id
        and lower(coalesce(p.status, '')) = 'paid'
        and coalesce(p.allocations->'lines','{}'::jsonb) ? ('salik-' || s.id::text)
      group by p.contract_id
      having abs(sum((p.allocations->'lines'->>('salik-' || s.id::text))::numeric) - s.amount) < 0.009
    );

  if expected_count = 0 then
    return; -- Already reconciled.
  end if;

  if expected_count <> 49 or expected_total <> 301.00 then
    raise exception 'Salik reconciliation scope changed: % rows, % AED (expected 49, 301.00)',
      expected_count, expected_total;
  end if;

  update public.salik s
  set status = 'Paid'
  where s.status = 'Unpaid'
    and s.paid_at is not null
    and s.contract_id is not null
    and exists (
      select 1
      from public.payments p
      where p.contract_id = s.contract_id
        and p.owner_id = s.owner_id
        and lower(coalesce(p.status, '')) = 'paid'
        and coalesce(p.allocations->'lines','{}'::jsonb) ? ('salik-' || s.id::text)
      group by p.contract_id
      having abs(sum((p.allocations->'lines'->>('salik-' || s.id::text))::numeric) - s.amount) < 0.009
    );
  get diagnostics changed_count = row_count;
  if changed_count <> 49 then
    raise exception 'Salik reconciliation updated % rows instead of 49', changed_count;
  end if;
end;
$$;
