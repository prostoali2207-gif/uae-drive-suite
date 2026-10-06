-- Keep showroom finance catalog aligned with the live October 2026 source workbook.
update public.showroom_finance_operation_catalog
set cash_row = 44, ajman_row = 28, source_updated_at = now()
where sort_order = 3;

update public.showroom_finance_operation_catalog
set article = 'Полученные средства от инвестора на покупку авто',
    direction = 'Приход',
    cash_row = 28,
    ajman_row = null,
    search_terms = 'инвестор средства покупка авто',
    active = true,
    source_updated_at = now()
where sort_order = 4;

update public.showroom_finance_operation_catalog
set cash_row = null, ajman_row = 34, source_updated_at = now()
where sort_order = 5;

update public.showroom_finance_operation_catalog
set cash_row = 46, ajman_row = 57, source_updated_at = now()
where sort_order = 7;

update public.showroom_finance_operation_catalog
set cash_row = 71, ajman_row = 66, source_updated_at = now()
where sort_order = 11;

update public.showroom_finance_operation_catalog
set cash_row = 89, ajman_row = 83, source_updated_at = now()
where sort_order = 13;

update public.showroom_finance_operation_catalog
set cash_row = null, ajman_row = 89, source_updated_at = now()
where sort_order = 14;

update public.showroom_finance_operation_catalog
set cash_row = null, ajman_row = 95, source_updated_at = now()
where sort_order = 15;

update public.showroom_finance_operation_catalog
set article = 'выплата инвестору дохода от проданного авто (100% инвест)',
    direction = 'Расход',
    cash_row = 83,
    ajman_row = null,
    search_terms = 'доход инвестору проданное авто',
    active = true,
    source_updated_at = now()
where sort_order = 25;

update public.showroom_finance_operation_catalog
set cash_row = 95, ajman_row = 140, source_updated_at = now()
where sort_order = 27;
