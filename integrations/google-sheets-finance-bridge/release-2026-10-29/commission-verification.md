# Commission vehicle choices — 2026-10-29

- Added yaris 2021 abdullah, xpander abdullah, ertiga abdullah and Шевролет абдуллы to комиссия от продажи авто (наши средства 100%).
- Existing ten commission subcategories retained; 14 choices total.
- Production Sheets Справочники H27:I30 added only. Existing Месяц A104 spill formula automatically renders the four new detail rows; no report formula changes.
- Native dependent dropdown _ДДС BO5:CH5 reread: all 14 choices present. Monthly commission total remains 4000 AED.
- Supabase vlcxjizieelcfunausll catalogue metadata contains exactly the same 14 choices; data-only SQL saved in commission-catalog-2026-10-29.sql.
- Bridge existing deployment updated through browser to v17, API URL/permissions retained. Exact source FinanceBridgeLive_2026-10-29.gs differs from v16 only by the commission capability flag and vehicle article whitelist entry (regression enforced).
- Published authenticated get_context returns showroom_vehicle_commission_subcategory_supported=true.
- Edge fleetdesk-telegram-finance v23 ACTIVE; published source reread exactly.
- Telegram frontend committed to main e5467c64fa8b051e5c31085d98ef4762dbeaa208; Vercel production dpl_CUCF7xxZZkS81vMiDdPDJbi4aRjW READY.
- 9 UI/correction tests, 39 Edge handler validation checks, 38 existing correction handler checks, catalogue and Bridge source-preservation checks PASS. Build PASS; lint zero errors, one existing effect-dependency warning.
- Real QA workbook 1B2JraDVMC4Ps3j_seaEsVQiTZvS3u13iiN3No3qUa6Q: all four new commission vehicles posted only on QA, T correct, all four exact Monthly deltas correct, same-ID replay returned duplicate and new-ID duplicate blocked. No production test payment.
- Production journal A5:T1004 and Monthly A4:H5 exactly unchanged before/after.
- No authenticated real Telegram session was exercised; Telegram selector and payload behavior were verified by component tests. Native Sheets screenshot timed out; connector verified dropdown values and effective Monthly results.
- Browser, Google Sheets, FleetDesk Ops/QA and Supabase guidance applied. No delegated agents.
