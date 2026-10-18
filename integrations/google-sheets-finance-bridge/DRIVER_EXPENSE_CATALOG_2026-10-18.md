# Driver expense catalog — Bridge/report verification 2026-10-18

Scope: showroom. Existing payments, Rental and balances unchanged. Edge v20 unchanged.

## Production installed and verified

- Existing Apps Script project 15st3EDVyLrETA8EttAeA0lfsbf9DYMN7KwTNmNktLDke3jPYIgcSWq1u, existing deployment updated from v14 to **v15**.
- API URL retained: https://script.google.com/macros/s/AKfycbx-Zh3OD-aXy2rpmBFWw2mXvUUOLMn69Ndxx4lf2KDBi26FgfPRvY5UPfTMj6-49wY_uA/exec
- Authenticated get_context against published /exec: HTTP 200, ok=true, showroom_vehicle_subcategory_supported=true, driver_wallet_supported=true, showroom_corrections_supported=true; correct showroom spreadsheet ID.
- Exact deployed source: FinanceBridgeLive_2026-10-18.gs. Vehicle support from prepared Code.gs merged into live v14. Unrelated calendar implementation in prepared Code.gs was not deployed because it changes shared Rental behavior. Transfers, corrections, mirrors and Rental implementation retained.
- Duplicate identity now includes T. Different cars can have equal amount/note. A legacy match with blank T blocks conservatively. Separate identical payments for the same car still require different explanations, as before.
- October car rows 66:73: eight canonical cars, matching T + date + account + purchase operation. Notes use identical filtering. Row 74: unallocated/unknown-T exception, parent purchase total minus assigned cars. Monthly totals populated for eight cars and exception. Removed stale nth-row purchase formulas in row 79.
- Removed obsolete strict dropdown validation only from calculated note outputs. Input validation retained.
- All 1,276 intended cell edits reread exactly: zero mismatches, zero calculated errors in B65:EA84.
- Journal A:T compared before/after: unchanged. Driver movements and driver summary unchanged. Cash closing 11,044.50 AED; AJMAN closing -15,572 AED; driver balances 411 / 0 AED unchanged. These are observed baseline controls, not historical financial reconciliation.
- Supabase vlcxjizieelcfunausll: fleetdesk-telegram-finance v20 ACTIVE, verify_jwt=false retained.
- Vercel production dpl_DvzRUwXxc6C7TDowBKxDNEnLFuxc READY.

## Real spreadsheet QA

Successful execution completed at browser-log time 14:27:41 on 2026-10-18. QA spreadsheet: 1OeclYHyPz2PrtpPnpV55SCVMpozR19yrjN9VpeX1EGc. Candidate functions executed with QA showroom ID and disabled Rental ID, no production API writes.

PASS: purchase and note in A:E; Lexus in T; same-ID retry; new-ID duplicate blocked; unknown car blocked; same ID/different car blocked; different cars/equal amount and note accepted; canonical Yaris spelling; one wallet movement on retry; balance reduced exactly 17.39 AED; Lexus and Yaris subtotals correct; other cars unchanged; note under Lexus; generic expense; transfer retry; exactly two paired transfer rows; capability flag.

Focused regressions rerun successfully: scripts/test-telegram-driver-expense-catalog.cjs against published Edge v20 source and frontend; showroom-bridge-request-id.test.cjs against updated prepared Code.gs. Replay fixture updated from 18 to 20 columns to cover T.

## Limits and manual verification

- No production test payment created. Real phone/Telegram submission and a Supabase audit insertion were not end-to-end executed. Authorization/vehicle forwarding/wallet integration checked by focused regression; journal/report/wallet tested on real QA spreadsheet.
- Native Sheets screenshot/DOM verification timed out in connected browser. Formula/effective-value verification succeeded. No styling changes made.
- August/September reports not rewritten. October is the prepared month template; no future month existed. Calendar automation remains outside scope.
- With next genuine driver expense: select purchase, choose car, enter note; verify one history/audit item, T, matching car report row and one wallet debit; retry must not add another item. Do not create live test payments.
- QA runner removed from production project before release. Editor contents reread and exactly matched deployed-source snapshot.

Skills: Browser, Google Sheets, FleetDesk Rental Ops, QA, Supabase, FleetDesk Supabase Agent. No delegated agents.
