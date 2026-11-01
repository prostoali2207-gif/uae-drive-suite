# Input month filter — 2026-11-01

- Month selector X3: existing monthly sheets plus Все месяцы; visible month banner Y3:AA3. Type V3 remains independent.
- Native filter on storage date A includes selected month and blank draft rows; All months shows saved rows only.
- Native U date rule restricted to selected month; authoritative guard in sgiRow_ and showroomEntrySubmit executes before A:T writes.
- Queue captures selected month; changing the month before delayed save blocks rather than misfiles payment.
- On open refreshes choices and selects current month unless pending edits exist.
- QA copy 1B2JraDVMC4Ps3j_seaEsVQiTZvS3u13iiN3No3qUa6Q: November valid row250 saved 12.34 AED and Lexus in T; September under November blocked with A:T empty; All months blocked; selecting September saved row251. QA only. Tests 10:41:11–10:44:25 Dubai, seven PASS signals.
- QA native month filter, independent type filter and DATE_BETWEEN checks passed.
- Local grid14, queue9, month scenarios11 plus installer safety check, entry form test passed.
- Production November native date range 01.11.2026–30.11.2026 reread; UI visually inspected; filter switched from 903 visible rows (November + blanks) to101 saved rows (All months), then November restored.
- Production A5:AA120 user-entered snapshot unchanged. Month balances matched initial comparison; later user changed Month report selector to September, while journal remained unchanged.
- During initial editor QA launch, stale function selection accidentally invoked the old installer and added a second current-account showroomGridOnEdit. Removed exactly that trigger; verified five total triggers remain, original other-account handler retained. Installer now requires explicit spreadsheet ID, preventing accidental Run-button installation. No payment duplicates.
- Bound source saved; QA helper removed. Rental, API deployment and Telegram unchanged by this release.

Manual use: choose month X3; enter dates within that month. To enter an old expense, choose its month first. All months is read-only for U:AA and sidebar submissions. Shared Google Sheets selector applies to all editors.
