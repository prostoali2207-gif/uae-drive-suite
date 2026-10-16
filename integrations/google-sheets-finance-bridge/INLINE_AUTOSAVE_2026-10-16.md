# Inline autosave investigation — 2026-10-16

## Confirmed causes
Production bound project: 1NuFbHLkGWDcU570lTeq_Uz4DouFapBAtEPPBSlmycT9XyrOkMl2YtPih. Its ShowroomGrid matched main before any installation.

Production executions on October 15 at 20:36:27 and 20:36:49 Asia/Dubai reject row 57 as a damaged mirror. The guard incorrectly rejects rapid sequential edits to an empty journal row before a draft note exists. Its restore then writes blank-returning formulas into strictly validated date/number/dropdown cells and fails.

An additional real-UI test on the isolated QA copy on October 16 at 21:31:11 timed out after 30.373 seconds under the simple onEdit trigger. Editor-only tests did not reveal this because editor executions have a longer limit. A simple trigger is not a reliable execution context for this spreadsheet's autosave and pair reconciliation.

## Candidate, not installed in production
Preserve unmarked drafts only when storage and source/pair identities are empty; retain stale/shifted-formula and occupied-row protection. Restore truly empty mirrors as actual blanks. Mark drafts without rewriting all input fields. On an identical retry, invoke existing transfer reconciliation to repair an interrupted pair.

Move the entry point to showroomGridOnEdit, intended for one installable spreadsheet On edit trigger. showroomInstallGridTrigger verifies the bound spreadsheet ID, reuses its own existing trigger, refuses duplicate/wrong-type handlers, and never deletes or changes other triggers. Removing the reserved simple onEdit name avoids two handlers processing the same input.

19 Node regression tests PASS, including installer target guard, idempotency, duplicate refusal and unrelated-trigger preservation.

## Isolated Google QA
Spreadsheet: https://docs.google.com/spreadsheets/d/104iWDidknXzuYrNe8bQtf4lRUFsdJVCgWRQ06jTRr3s/edit
Bound script: https://script.google.com/u/0/home/projects/1sd_3kZg09wAy4gUV78uchfsfBMv8gQ_z0epHC066enQpvMNegF7g61R_/edit
Owner verified as Ali, prostoali2207@gmail.com. Copied Rental, Showroom and transfer IDs point only to QA.

Completed editor stages:
- Income 7101.11 saved, 16:03:30.
- Expense 7102.22 saved; stage completed at 16:05:22.
- Same-row replay and cross-row duplicate rejection PASS, 21:26:39.
- Cash to AJMAN 7204 and replay preserving the same peer PASS, 21:30:51.
- AJMAN to Cash 7205 and replay preserving the same peer PASS, 21:41:44.
- Original rapid-date/type rejection reproduced; corrected handler retained both values, 15:59:25.
- Retry recreates a missing QA counterpart PASS at 21:45:48; actual empty mirrors retain strict validation PASS at 21:46:01. All editor stages 0–5 completed.

The initial missing-pair fixture wrote storage directly and hit dependent operation validation. It was replaced with a previously validated transfer source whose QA-only counterpart is removed before retry; production records are never involved.

## Permissions and release gate
QA manifest initially limited to spreadsheets.currentonly and the user granted that scope.
Google's trigger-management UI additionally requested all spreadsheets. That scope was left unchecked; the UI repeated authorization rather than creating a trigger. No all-spreadsheets access was granted.

The prepared programmatic installer uses only spreadsheets.currentonly plus script.scriptapp. Google documents the latter as necessary for ScriptApp.newTrigger; it authorizes project trigger management/background execution, not all-spreadsheet access. References:
- https://developers.google.com/apps-script/reference/script/script-app#newTrigger(String)
- https://developers.google.com/apps-script/reference/script/trigger-builder#forSpreadsheet(Spreadsheet)

Pending: authorize only this minimum installer scope, create the QA trigger, verify real UI sequential/rapid input, replay and pair repair without a 30-second timeout. A real physical phone session has not been tested. No production deployment or main merge until that QA gate passes.

## Production safety
Only the bound ShowroomGrid candidate is intended for deployment; no QA IDs, old handlers or test runner belong in production. Existing three triggers remain unchanged: ddsOnEditStamp, showroomTransferOnEdit, showroomTransferOnChange (owned by another user). Add only one showroomGridOnEdit trigger after QA PASS.
Rental, Telegram and Finance Bridge are untouched. Production financial operations, including manually repaired 57/58 and existing 49–52, have not been modified. A5:E1004 and N5:T1004 user-entered snapshots before/after this QA work compare equal.

Manual verification after installation: on QA enter date/type/account/operation/object/amount one cell at a time; confirm A:T and exactly one peer for each transfer direction; replay the amount and confirm no additional rows. In production verify source checksum, four intended triggers and nonfinancial filter edit only; create no test payments.
