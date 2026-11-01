# Compact input month view — checkpoint 2026-11-01
Status: COMPLETED 2026-11-01. Final acceptance, v20 publication, financial preservation comparison and GitHub changes documented in compact-final-verification.md. Earlier checkpoint below retained as historical handoff evidence.

## Confirmed production state
- Original spreadsheet 16Nb1bP-u5ox9RX4kH5fWa-GaYvAIoisyLMFSiGbtvJA and input sheetId589146974 retained.
- A:T source rows retained in place; U:AA is a compact monthly projection with mapping AB and signature AC.
- October release render reported 77 records, firstRow5, at13:12 Dubai.
- Last completed full A5:T1004 before/after comparison found no user-entered or effective-value differences; selected Month report was also unchanged.
- Subsequent connector read confirmed selected November, ready banner, dates2026-11-01 in U5:U8, source mapping104,105,106,107 and blank new row9.
- All-months option removed. Date guard, draft preservation, queue generation guard and shared-lock handling remain.
- Existing API deployment was confirmed at version19 with original URL. Live GET ledger=showroom returned ok and period2026-11-01..2026-11-30.
- A later nonce-only deployment was attempted; receipt still showed19. Treat20 as UNCONFIRMED.
- Bound Grid is deployed as concatenation ShowroomGrid.gs + ShowroomCompact.gs; Entry has refresh notifications.
- No additional Apps Script service was enabled. The service dialog was cancelled.
- No production test payment, historical transaction rewrite, Rental, Supabase or frontend code change.

## Checks completed
- QA workbook1B2JraDVMC4Ps3j_seaEsVQiTZvS3u13iiN3No3qUa6Q only:
  - rendering left every financial cell unchanged;
  - November source250 showed at display5;
  - display5 edit12.34→12.35 changed source250;
  - September also began at5;
  - unfinished draft survived attempted month switch;
  - new0.47 transfer created exactly source and automatic peer; retry retained exactly two;
  - bridge inspection found source250 through display mapping;
  - bridge0.33 purchase posting and same-ID retry worked; projected display stayed unchanged.
- Local tests: compact13, grid14, durable queue9, month boundaries11, entry-form test, existing correction protocol37 passed.
- Native Range.setFormulas hit dependent dropdown validation. Final path builds absolute source formulas on hidden _Ввод_месяц_буфер then native-pastes formulas; removes basic filter BEFORE paste to avoid skipped rows/grid expansion.
- Simple onOpen timeout found in live verification. Deployed fix schedules refresh and returns within simple-trigger budget; loading banner and pre-write guard block edits while selected/rendered contexts differ.

## Outstanding at earlier handoff (resolved; see final verification)
- Final browser switching/visual acceptance and byte-exact source re-read after latest fixes.
- Refresh-cursor refinement was prepared in orchestration but NOT published: keep producer notification AF separate from acknowledged cursor/hash AG/AH to avoid lost or repeated refresh notifications. Two hidden columns AG/AH were reserved and are blank; deployed code still uses AF protocol.
- Current working files reconstruct the last released AF protocol, not that pending refinement. Verify against live source before resuming publication.
- Automatic approval rejected opening the Apps Script editor because the account reached its usage limit. Do not switch browser/control surfaces or bypass that rejection. Resume browser work only after access is restored.

