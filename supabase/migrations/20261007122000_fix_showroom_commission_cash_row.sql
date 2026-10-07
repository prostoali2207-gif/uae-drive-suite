-- Keep showroom finance catalog aligned with the live Google Sheet mapping.
update public.showroom_finance_operation_catalog
set cash_row = 34,
    source_updated_at = now()
where sort_order = 3
  and article = 'комиссия от продажи авто (наши средства 100%)'
  and active = true
  and cash_row = 44;
