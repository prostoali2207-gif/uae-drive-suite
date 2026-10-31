-- Applied to vlcxjizieelcfunausll on 2026-10-31.
-- Matching Google Sheets mappings added at Справочники!H31:I33.
-- Verified Month shows zero-value vehicle details for all three categories.
-- Production operations A5:T1004 and Month balances A4:H5 unchanged.
-- Existing Telegram UI reads these vehicles dynamically; no code deployment required.
UPDATE public.showroom_finance_operation_catalog SET search_terms = replace(search_terms, ']]', '|Стингер Абдулла]]'), source_updated_at = now() WHERE article IN ('покупка авто для перепродажи','Приход от продажи инвесторских авто','комиссия от продажи авто (наши средства 100%)') AND active = true AND search_terms LIKE '%[[vehicles:%]]%' AND position('Стингер Абдулла' in search_terms) = 0 RETURNING article,search_terms;
