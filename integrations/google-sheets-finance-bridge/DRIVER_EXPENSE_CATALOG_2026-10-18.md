# Driver expenses — partial rollout and remaining finance checks (2026-10-18)

Scope: Showroom Telegram Mini App only. No Rental changes, no production test payments.

## Completed and independently verified

- Supabase project: `vlcxjizieelcfunausll`. Edge Function `fleetdesk-telegram-finance` production v20, `verify_jwt=false` preserved, reread as ACTIVE.
- Session/search/record use the active showroom catalog rather than old eight-item `DRIVER_EXPENSE_ARTICLES` allowlist. Drivers remain `cash_aed` + `expense` only. Account transfers deliberately excluded: they are not driver expenses.
- All 15 active cash-mapped non-transfer expenses are eligible (incl. purchase car, salary and investor payments); three bank-only catalog entries have no Cash mapping and are not opened. **Do not invent Cash mappings**.
- `src/telegram-finance/TelegramFinanceApp.tsx` has car dropdown and optional item note for purchase. Frontend deploy on Vercel was READY.
- Live Supabase catalog purchase search terms aligned with eight Excel-derived vehicle labels. Applied migration committed as `20261018115500_sync_showroom_purchase_vehicle_choices.sql`. Case in first four *display* labels is title case; Google Sheets source is lower case; Bridge code normalizes to canonical workbook spelling before storing.
- `supabase/functions/fleetdesk-telegram-finance/index.ts` sends `vehicle` separately to Bridge, audit and driver-wallet movement. It rejects invalid purchase vehicles. For driver purchase it requires `showroom_vehicle_subcategory_supported===true` from live Bridge context: **until bound Apps Script is published, car purchases fail safely**, not silently without T attribution.
- `integrations/google-sheets-finance-bridge/Code.gs` contains optional `vehicle` support, validation against live `Справочники!H:I`, storage in column T, idempotent retry repair, and the get_context capability flag.
- Tests passed: `scripts/test-telegram-driver-expense-catalog.cjs`, `integrations/google-sheets-finance-bridge/showroom-driver-vehicle.test.cjs`, `showroom-bridge-request-id.test.cjs` (executed with focused JS mocks). No live Telegram posting test.

## Remaining before FULL PASS

1. **Publish the latest Code.gs in the real Finance Bridge Apps Script**. Compare to live code and preserve recent updates. Update the existing /exec deployment, keeping URL and Rental behavior. Do not deploy a second duplicate Bridge. After publication, call `get_context` for showroom and verify `showroom_vehicle_subcategory_supported=true`. No test payments in production.
2. **Correct car subtotal formulas on a test spreadsheet copy** before production: Current `Октябрь 2026!C66` sums all purchases without checking T, and `C67:C69` / other rows use nth-row `INDEX(FILTER(...))`, so a payment can display under the wrong car. Use car name in B and `Ввод операций!T` as matching criterion for car subtotals, with date, account and operation constraints. Map eight real car names; preserve month daily total, financial balance, and existing reports. Explicitly handle historical rows lacking T as exceptions, not invented allocations. Reconcile all months / future-month template only as necessary. Avoid unrelated refactoring.
3. On QA copy test driver real car expense (purchase auto + note) -> one audit, one main A:E entry, correct car in T, one driver wallet movement with vehicle and correct balance, no double posting on retry, and per-car monthly amount. Test a generic expense and cash-only restrictions, transfers, Rental unchanged.
4. After successful QA, apply only required report/formula changes to live Sheets and confirm ledger A:E financial transactions unchanged. Recheck production Supabase Edge v20 and Vercel READY, then report exact PASS/BLOCKED with evidence.

Important sources:
- Production Google spreadsheet: `16Nb1bP-u5ox9RX4kH5fWa-GaYvAIoisyLMFSiGbtvJA`
- Apps Script bound project (known): `15st3EDVyLrETA8EttAeA0lfsbf9DYMN7KwTNmNktLDke3jPYIgcSWq1u`
- Repo: `prostoali2207-gif/uae-drive-suite`

Do not change historical financial data or driver balances. Do not open AJMAN-only rows to a Cash wallet without separate validated accounting requirements.
