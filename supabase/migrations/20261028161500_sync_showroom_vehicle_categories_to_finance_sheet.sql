-- Sync Telegram showroom vehicle selector metadata to the live finance workbook.
-- "Справочники" H:I is the authoritative list as of 2026-10-28.
-- No historical transactions, amounts, balances, or reporting formulas are modified.
update public.showroom_finance_operation_catalog
set search_terms = 'покупка выкуп авто [[vehicles:yaris 2021 abdullah|xpander abdullah|ertiga abdullah|camry 2017|Шевролет абдуллы|Lexus]]',
    source_updated_at = now()
where sort_order = 11 and article = 'покупка авто для перепродажи'
  and direction = 'Расход' and active = true;

update public.showroom_finance_operation_catalog
set search_terms = 'продажа инвесторских авто [[vehicles:yaris 2021 abdullah|xpander abdullah|ertiga abdullah|Шевролет абдуллы]]',
    source_updated_at = now()
where sort_order = 2 and article = 'Приход от продажи инвесторских авто'
  and direction = 'Приход' and active = true;

update public.showroom_finance_operation_catalog
set search_terms = 'продажа собственных авто [[vehicles:camry 2017|Lexus]]',
    source_updated_at = now()
where sort_order = 1 and article = 'Приход от продажи собственных авто'
  and direction = 'Приход' and active = true;
