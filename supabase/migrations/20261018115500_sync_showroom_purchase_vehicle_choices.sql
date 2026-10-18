-- Align Telegram showroom purchase choices with the live Google Sheets "Справочники" H:I list.
-- This changes only selector metadata; historical finance and driver entries are untouched.
update public.showroom_finance_operation_catalog
set search_terms = 'покупка выкуп авто [[vehicles:Yaris 2021 Abdullah|Xpander Abdullah|Ertiga Abdullah|Camry 2017|Yaris 2021|Ertiga|Шевролет абдуллы|Lexus]]',
    source_updated_at = now()
where article = 'покупка авто для перепродажи'
  and direction = 'Расход'
  and active = true;
