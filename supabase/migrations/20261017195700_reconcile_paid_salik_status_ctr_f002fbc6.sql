-- Restore paid status only for two confirmed Salik allocations in contract CTR-F002FBC6.
-- Payment on 2026-09-16 includes both charges at AED 7.30 each.
-- Safe to rerun: only rows with existing paid_at and matching recorded payment are updated.
update public.salik as s
set status = 'Paid'
where s.contract_id = 'f002fbc6-45e7-4395-a7ad-9fd04c497531'
  and s.id in (
    '2164229e-08a2-4998-906c-6fcbb8d57589',
    'ec5660a0-a783-43be-aca3-7bf6ae440551'
  )
  and s.status = 'Unpaid'
  and s.paid_at is not null
  and exists (
    select 1
    from public.payments as p
    where p.contract_id = s.contract_id
      and lower(coalesce(p.status, '')) = 'paid'
      and (p.allocations -> 'lines' ->> ('salik-' || s.id::text))::numeric >= s.amount
  );
