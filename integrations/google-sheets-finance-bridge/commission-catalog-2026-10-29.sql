-- Commission vehicle options: preserve ten legacy choices and add four investor cars.
-- Catalogue metadata only; no financial operation or balance changes.
UPDATE public.showroom_finance_operation_catalog
SET search_terms = 'комиссия продажа авто [[vehicles:b23440|и46347|b93453|santafe|b23370|b13188|b96275|b62650|b73364|b71265|yaris 2021 abdullah|xpander abdullah|ertiga abdullah|Шевролет абдуллы]]', source_updated_at = now()
WHERE article = 'комиссия от продажи авто (наши средства 100%)' AND active = true AND sort_order = 3
  AND direction = 'Приход' AND cash_row = 34 AND ajman_row = 28;
