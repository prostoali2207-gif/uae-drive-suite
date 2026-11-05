# Full visible row deletion — 2026-11-05

User requested removing October visible row80, Lexus purchase expense210 AED, AJMAN31.10.2026. Live mapping AB80=103 and source ID sgi-cd59d65e-8060-45de-a6bf-1e9b77b0c8b5 verified before mutation.

Cause: sgiRow_ handled an all-empty input by restoring its saved mirror. It never removed mapped canonical A:E/T values. A periodic refresh therefore restored the record.

Fix in bound concatenated ShowroomGrid.gs and repository ShowroomGrid.gs: an explicitly edited seven-column U:AA row with all cells empty clears its mapped A:E and T before ordinary operation validation. Source signature and view-generation guards remain, and sgiAssertMonth_ validates current/rendered/captured month. Existing stSyncRow_ removes a transfer counterpart if applicable. Existing sgiMirror_ publishes the blank baseline; AF invalidates compact rendering. ID and timestamp remain for traceability. Partial clears stay drafts; no physical rows are deleted.

Tests: full seven-cell clear removes only mapped source fields; partial-column clear does not take deletion branch; stale view/month assertion prevents writes. All passed.

Live deletion used the existing showroomGridOnEdit queue, with a temporary helper guarded by month, mapping, ID, vehicle and amount. Canonical A103:E103 and T103, visible U80:AA80, hidden saved baseline A80:G80 read back blank. Neighboring500 and30500 AED records retained. Temporary helper removed after execution. No trigger changes or financial test postings.
