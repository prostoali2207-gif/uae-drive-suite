# Showroom history corrections

Owner and manager may edit amount, existing operation, vehicle/object and note, or cancel an applied showroom entry. Date, account and direction stay fixed. Paired transfers are blocked. Rental is unchanged.

The server verifies Telegram identity and active staff role. Service-role-only RPCs serialize corrections and retain immutable before/after values and actor. The bridge edits the original row under a script lock, retaining Request ID. Cancellation clears financial input cells and marks driver movement cancelled; it does not delete the audit. Monthly formulas recalculate from input values. Purchase vehicle text is retained in monthly report notes and column T.

Retries use the same correction ID and version. Partial sheet writes resume only from exact expected before/after states. A pending response is not success. If a manual sheet edit or draft prevents recovery, the response identifies the issue; reconcile that row before retrying the saved correction. Do not create a replacement expense.

## Installation

`ShowroomCorrections.gs` is an additional Apps Script source file; Code.gs includes its routes and readiness flag. For the existing live project, preserve its custom transfer and display helpers: apply only the two routes, readiness flag and these functions. Never replace the live source with the repository template wholesale.

Published 2026-10-15: existing Apps Script deployment version 13, same API URL; Supabase function version 19. Migration version 20261015111742 matches the live migration ledger.

## Safe verification

- `node integrations/google-sheets-finance-bridge/showroom-corrections.test.cjs`: 37 isolated bridge tests.
- `node scripts/test-showroom-finance-handlers.mjs`: 38 backend assertions; network disabled.
- `node scripts/test-showroom-finance-corrections.mjs`: 41 PostgreSQL/PGlite assertions (setup documented in script).
- `npx vitest run src/telegram-finance/FinanceCorrection.test.tsx`: 5 UI tests.
- `npm run build`: PASS. Independent QA and mobile/RTL UI Guard: PASS.

Tests cover amount/category edits, cancellation, negative driver balances, monthly/account totals, tenant/role rejection, repeated requests and failures between writes. Monthly assertions model the inspected SUMIFS formulas; they do not execute the Sheets formula engine. No production financial fixtures were created.

Manual checks: open Mini App in Telegram as owner/manager, select showroom history, open Edit, review original/new values, then exit without saving. Confirm transfers show the restriction. Drivers must not see edit/delete controls. A legitimate future correction should show success only after sheet and database confirmation; pending requests should be resumed using the history action.
