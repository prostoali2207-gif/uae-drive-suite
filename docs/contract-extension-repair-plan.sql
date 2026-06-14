-- Review and run manually. This script does not touch payments, fines, Salik,
-- deposits, clients, or cars. Keep COMMIT commented until the final SELECTs
-- show exactly the expected rows.

begin;

-- CTR-38D8AF6B / 38d8af6b-4814-4cb1-af1c-f401a3b9f948
-- Restore original contract period and create the missing first extension.
update public.contracts
set end_date = date '2026-06-02'
where id = '38d8af6b-4814-4cb1-af1c-f401a3b9f948'::uuid
  and start_date = date '2026-05-02'
  and end_date = date '2026-08-02'
returning id, start_date, end_date;

insert into public.contract_fees (
  contract_id,
  category,
  label,
  amount,
  extension_start,
  extension_end,
  owner_id
)
select
  c.id,
  'other',
  'Rental Extension: 2026-06-02 - 2026-07-02',
  2800,
  date '2026-06-02',
  date '2026-07-02',
  c.owner_id
from public.contracts c
where c.id = '38d8af6b-4814-4cb1-af1c-f401a3b9f948'::uuid
  and not exists (
    select 1
    from public.contract_fees cf
    where cf.contract_id = c.id
      and cf.extension_start = date '2026-06-02'
      and cf.extension_end = date '2026-07-02'
  )
returning id, contract_id, label, amount, extension_start, extension_end;

-- 53b288bb-a054-4e7c-ae72-df1b2e1f02d9
-- Persisted extension chain is complete. Restore original contract end only.
update public.contracts
set end_date = date '2026-06-01'
where id = '53b288bb-a054-4e7c-ae72-df1b2e1f02d9'::uuid
  and start_date = date '2026-05-01'
  and end_date = date '2026-07-22'
returning id, start_date, end_date;

-- 832e7182-9afb-4c83-81aa-81005dd6e17b
-- Daily contract: expected original end from total/rate is 2026-06-26.
-- First persisted extension starts 2026-06-30, so this inserts the missing
-- 4-day extension at rate_amount * 4 = AED 400. Review this amount before COMMIT.
update public.contracts
set end_date = date '2026-06-26'
where id = '832e7182-9afb-4c83-81aa-81005dd6e17b'::uuid
  and start_date = date '2026-06-09'
  and end_date = date '2026-08-26'
returning id, start_date, end_date;

insert into public.contract_fees (
  contract_id,
  category,
  label,
  amount,
  extension_start,
  extension_end,
  owner_id
)
select
  c.id,
  'other',
  'Rental Extension: 2026-06-26 - 2026-06-30',
  400,
  date '2026-06-26',
  date '2026-06-30',
  c.owner_id
from public.contracts c
where c.id = '832e7182-9afb-4c83-81aa-81005dd6e17b'::uuid
  and not exists (
    select 1
    from public.contract_fees cf
    where cf.contract_id = c.id
      and cf.extension_start = date '2026-06-26'
      and cf.extension_end = date '2026-06-30'
  )
returning id, contract_id, label, amount, extension_start, extension_end;

select
  c.id,
  c.start_date,
  c.end_date,
  cf.id as fee_id,
  cf.label,
  cf.amount,
  cf.extension_start,
  cf.extension_end
from public.contracts c
left join public.contract_fees cf on cf.contract_id = c.id
where c.id in (
  '38d8af6b-4814-4cb1-af1c-f401a3b9f948'::uuid,
  '53b288bb-a054-4e7c-ae72-df1b2e1f02d9'::uuid,
  '832e7182-9afb-4c83-81aa-81005dd6e17b'::uuid
)
order by c.id, cf.extension_start nulls first, cf.created_at, cf.id;

-- rollback;
-- commit;
