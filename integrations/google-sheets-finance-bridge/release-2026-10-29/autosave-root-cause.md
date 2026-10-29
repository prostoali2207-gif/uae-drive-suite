# Durable showroom autosave — 2026-10-29

## Observed incident and evidence
Production row 92 contains a complete visible draft: 29 October 2026, expense, cash, purchase for resale, Lexus, 120 AED. A:T and the Request ID are empty. No saved matching Lexus/120 operation exists.
Bound project: 1NuFbHLkGWDcU570lTeq_Uz4DouFapBAtEPPBSlmycT9XyrOkMl2YtPih. Live ShowroomGrid.gs was read in the browser and matched the repository except a trailing blank line.
Execution history around 10:31–10:35 Dubai shows showroomGridOnEdit executions lasting 86–155 seconds, including 155.312 at 10:32:11, 141.115 at 10:32:14 and 154.010 at 10:32:25. The detailed Cloud logs for the historical invocation are unavailable. This limits attribution of the precise invocation/statement for row 92.
The confirmed code defect is loss of an edit after tryLock(120000) returns false: the old handler only showed a temporary toast and returned, with no persistent work item or retry. It also caught exceptions without rethrowing, so Completed / 0% errors did not prove a payment was saved. This failure path is reproduced by tests; it is consistent with the long-running overlapping events and unmarked draft.

## Fix
- Store an immutable per-event/per-row work item in Script Properties BEFORE attempting the financial lock. The queue stores row/column identifiers, timestamps and errors, not financial payloads.
- Wait at most one second for the existing shared lock. If busy, retain the event for automatic recovery.
- Coalesce events for the same row, keeping the exact set of columns actually edited. A range bounding two edits must not disable mirror validation for the columns between them.
- Acknowledge only captured event IDs after row processing and flush succeed. A later edit arriving during save remains queued.
- Retry transient errors (up to three attempts); retain validation/duplicate failures as blocked, report execution failure, and retry when the user corrects the row.
- Add only showroomResumeGridAutosave, a one-minute recovery trigger. Do NOT rerun showroomInstallGridTrigger under this account: the existing On edit trigger belongs to another account and must not be duplicated.
- Worker reads only queued future edits. It does not scan or post existing drafts such as row 92.
- Existing row validation, duplicate guard, Request ID, storage layout and transfer functions retained. Coalesced date/amount edits remain allowed on automatic transfer peers.
- No changes to standalone Finance Bridge v16, API URL, Supabase, Telegram, Rental, auth or reporting formulas.

## Verification
Local PASS:
- 14 grid regressions, including mirror integrity between coalesced edits, duplicates and allowed auto-transfer edits.
- 9 durable queue scenarios: busy lock, row coalescing, new edit during save, transient exception, duplicate block/correction, interrupted flush, irrelevant columns, different spreadsheet and idle recovery.
- Existing entry-form duplicate/retry regression and vehicle/catalog regressions PASS.
- git diff --check PASS.
An outdated pre-existing mirror test fixture was updated to implement the current getValues/setFormula interface; production mirror behavior was not changed.

Real Google Sheets QA only:
QA workbook 1B2JraDVMC4Ps3j_seaEsVQiTZvS3u13iiN3No3qUa6Q, production IDs replaced in evaluated candidate sources.
- Simulated busy lock leaves the visible 120 AED Lexus draft unposted and a durable work item present.
- Releasing the lock and invoking the real worker saves exactly one expense in row 200, including T=Lexus and a stable sgi Request ID. Idle replay adds nothing.
- A queued 1.23 AED cash-to-AJMAN transfer in row 201 creates exactly one source and one automatic peer; replay adds no pair.
- Month balances agree with the test movements: cash 6803.63, AJMAN -17380.77, combined -10577.14, control OK.
- QA validation was removed only from QA U200:AA201 to seed test drafts through the API; production validation was not changed.

## Installed
Browser editor reread exactly matched the candidate. Temporary QA helper removed before installation.
Installer completed at 10:55 Dubai. Trigger page shows the four original handlers retained plus one timed showroomResumeGridAutosave; its first automatic execution is visible at 10:55:17 with zero errors.
Production A5:AA110 before/after installation is exactly unchanged, including raw U:AA input, amounts and Request IDs. Row 92 remains an unposted draft by explicit task scope; no real payment was manually repaired.

## Operator follow-up
For the already stranded row 92, re-enter the amount 120 once when ready to save that real expense. This creates a new queued edit under the corrected handler; do not create a second payment row.
Future lock contention is recovered automatically without retyping.
