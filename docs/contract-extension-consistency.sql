-- Read-only contract extension consistency check.
-- Flags contracts where persisted extension periods do not line up with the
-- original period estimated from total_amount / rate_amount.

with extension_fees as (
  select
    cf.id,
    cf.contract_id,
    cf.label,
    cf.amount,
    cf.extension_start,
    cf.extension_end,
    cf.created_at,
    lag(cf.extension_end) over (
      partition by cf.contract_id
      order by cf.extension_start, cf.created_at, cf.id
    ) as prev_extension_end,
    row_number() over (
      partition by cf.contract_id
      order by cf.extension_start, cf.created_at, cf.id
    ) as extension_number
  from public.contract_fees cf
  where cf.extension_start is not null
     or cf.extension_end is not null
     or cf.label ilike 'Rental Extension:%'
),
contract_base as (
  select
    c.id as contract_id,
    c.start_date,
    c.end_date,
    c.rate_type,
    c.rate_amount,
    c.total_amount,
    cl.full_name as client_name,
    case
      when c.rate_amount > 0
       and c.rate_type = 'Daily'
       and abs((c.total_amount / c.rate_amount) - round(c.total_amount / c.rate_amount)) < 0.0001
        then c.start_date + (round(c.total_amount / c.rate_amount)::int * interval '1 day')
      when c.rate_amount > 0
       and c.rate_type = 'Monthly'
       and abs((c.total_amount / c.rate_amount) - round(c.total_amount / c.rate_amount)) < 0.0001
        then c.start_date + (round(c.total_amount / c.rate_amount)::int * interval '1 month')
      when c.rate_amount > 0
       and c.rate_type = 'Yearly'
       and abs((c.total_amount / c.rate_amount) - round(c.total_amount / c.rate_amount)) < 0.0001
        then c.start_date + (round(c.total_amount / c.rate_amount)::int * interval '1 year')
      else null
    end::date as expected_original_end
  from public.contracts c
  left join public.clients cl on cl.id = c.client_id
),
grouped as (
  select
    cb.*,
    count(ef.id) as extension_count,
    min(ef.extension_start) as first_extension_start,
    max(ef.extension_end) as last_extension_end,
    bool_or(ef.extension_start is null or ef.extension_end is null) as has_unstructured_extension_fee,
    bool_or(ef.extension_end <= ef.extension_start)
      filter (where ef.extension_start is not null and ef.extension_end is not null) as has_invalid_extension_range,
    bool_or(ef.prev_extension_end is not null and ef.extension_start < ef.prev_extension_end) as has_overlap,
    bool_or(ef.prev_extension_end is not null and ef.extension_start > ef.prev_extension_end) as has_gap_between_extensions,
    bool_or(ef.extension_number = 1 and cb.expected_original_end is not null and ef.extension_start > cb.expected_original_end) as missing_first_extension_period,
    bool_or(ef.extension_number = 1 and cb.expected_original_end is not null and ef.extension_start < cb.expected_original_end) as first_extension_overlaps_original,
    coalesce(jsonb_agg(jsonb_build_object(
      'fee_id', ef.id,
      'number', ef.extension_number,
      'start', ef.extension_start,
      'end', ef.extension_end,
      'amount', ef.amount,
      'label', ef.label,
      'prev_end', ef.prev_extension_end
    ) order by ef.extension_start, ef.created_at, ef.id) filter (where ef.id is not null), '[]'::jsonb) as extension_periods
  from contract_base cb
  left join extension_fees ef on ef.contract_id = cb.contract_id
  group by cb.contract_id, cb.start_date, cb.end_date, cb.rate_type, cb.rate_amount, cb.total_amount, cb.client_name, cb.expected_original_end
)
select
  contract_id,
  client_name,
  start_date,
  end_date,
  expected_original_end,
  rate_type,
  rate_amount,
  total_amount,
  extension_count,
  first_extension_start,
  last_extension_end,
  array_remove(array[
    case when extension_count > 0 and expected_original_end is not null and end_date <> expected_original_end then 'contracts.end_date differs from expected original end' end,
    case when missing_first_extension_period then 'missing first extension period from expected original end to first persisted extension start' end,
    case when first_extension_overlaps_original then 'first persisted extension starts before expected original end' end,
    case when has_gap_between_extensions then 'gap between persisted extensions' end,
    case when has_overlap then 'overlap between persisted extensions' end,
    case when has_invalid_extension_range then 'invalid extension range' end,
    case when has_unstructured_extension_fee then 'extension fee missing structured dates' end
  ], null) as problems,
  extension_periods
from grouped
where extension_count > 0
  and (
    (expected_original_end is not null and end_date <> expected_original_end)
    or coalesce(missing_first_extension_period, false)
    or coalesce(first_extension_overlaps_original, false)
    or coalesce(has_gap_between_extensions, false)
    or coalesce(has_overlap, false)
    or coalesce(has_invalid_extension_range, false)
    or coalesce(has_unstructured_extension_fee, false)
  )
order by contract_id;
