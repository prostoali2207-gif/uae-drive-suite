update public.showroom_finance_operation_catalog
set cash_row = 66,
    ajman_row = 66,
    search_terms = 'покупка выкуп авто [[vehicles:Yaris 2021 Abdullah|Xpander Abdullah|Ertiga Abdullah|Camry 2017]]',
    source_updated_at = now()
where article = 'покупка авто для перепродажи'
  and active = true;
