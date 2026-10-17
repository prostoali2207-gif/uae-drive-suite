# Inline autosave investigation — 2026-10-16

## Confirmed causes
Production bound project: 1NuFbHLkGWDcU570lTeq_Uz4DouFapBAtEPPBSlmycT9XyrOkMl2YtPih. Its ShowroomGrid matched main before any installation.

Production executions on October 15 at 20:36:27 and 20:36:49 Asia/Dubai reject row 57 as a damaged mirror. The guard incorrectly rejects rapid sequential edits to an empty journal row before a draft note exists. Its restore then writes blank-returning formulas into strictly validated date/number/dropdown cells and fails.

An additional real-UI test on the isolated QA copy on October 16 at 21:31:11 timed out after 30.373 seconds under the simple onEdit trigger. Editor-only tests did not reveal this because editor executions have a longer limit. A simple trigger is not a reliable execution context for this spreadsheet's autosave and pair reconciliation.

## Candidate saved in GitHub; not installed in production
Preserve unmarked drafts only when storage and source/pair identities are empty; retain stale/shifted-formula and occupied-row protection. Restore truly empty mirrors as actual blanks. Mark drafts without rewriting all input fields. On an identical retry, invoke existing transfer reconciliation to repair an interrupted pair.

Move the entry point to showroomGridOnEdit, intended for one installable spreadsheet On edit trigger. showroomInstallGridTrigger verifies the bound spreadsheet ID, reuses its own existing trigger, refuses duplicate/wrong-type handlers, and never deletes or changes other triggers. Removing the reserved simple onEdit name avoids two handlers processing the same input.

20 Node regression tests PASS, including installer target guard, idempotency, duplicate refusal, unrelated-trigger preservation, and the distinction between a queued restored event and an explicit value retry.

On October 17 real sequential UI edits exposed 10-second lock expiry. The installable handler now waits up to 120 seconds. It ignores a queued event only after mirror validation, when that event's edited cells have already been restored to formulas by a completed save; an explicit value retry still performs pair recovery. This prevents already-saved cell events from repeatedly reconciling the same transfer and occupying the lock.

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

Authorization completed October 17: exactly spreadsheets.currentonly plus script.scriptapp. The installer ran successfully at 06:26:08–06:26:09 Asia/Dubai (1.383 seconds). QA trigger list verified exactly one owned spreadsheet On edit handler, showroomGridOnEdit. No all-spreadsheet scope was granted.

Real UI results on October 17 (Asia/Dubai):
- Initial replay of interrupted row 908 ran through the installed trigger at 06:27:20, 10.999 seconds. A later read-only audit correctly detected a still missing peer; execution completion alone was not treated as success.
- Fresh rapid per-cell AJMAN → Cash input, row 914, amount 7914.14: audit at 06:32:49 verified source and exactly one correctly valued auto peer (row 59).
- Explicit retry of interrupted Cash → AJMAN row 908 at 06:33:23: read-only audit at 06:35:25 reported QA UI PASS: source, one peer, no duplicate. Earlier events were queued, explaining the delay.
- Row 910 replay at 06:34:05 was still reconciling during the 06:35:25 audit; its source was present but pair metadata had not yet been written. This was an in-flight observation, not a PASS.
- A fresh per-cell Cash → AJMAN input was entered in row 918, amount 7918.18, using the final queued-event optimization. Its final source/pair audit is pending. An over-fast UI automation batch in row 916 was rejected by Sheets validation; it is not counted as a successful scenario.
- Physical phone/native Sheets app has not been tested; desktop per-cell event behavior was exercised only.

## Current release gate: BLOCKED
The cloud-browser transport disconnected during the final audit attempt. A following DOM read and availability check both timed out at the tool transport layer. No Google authorization prompt caused this interruption. The connected Drive API cannot inspect the Ali-owned QA copy (403 caller has no permission), so it cannot independently close the pending QA gate. Do not request broader Google scopes or change sharing just to work around this.

Resume by reading the QA editor's latest qaAutosaveVerifyUI execution and the queued showroomGridOnEdit results. Verify rows 908, 910, 914 and 918: each valid source must have exactly one same-ID auto peer, correct account/direction/amount and no duplicate. Repeat an amount through the real UI and re-audit. Then install only the production-ID ShowroomGrid candidate, create exactly one new edit trigger, preserve the existing three triggers, verify production source and a nonfinancial event, and compare financial snapshots. No production deployment or main merge until QA PASS.

## Production safety
Only the bound ShowroomGrid candidate is intended for deployment; no QA IDs, old handlers or test runner belong in production. Existing three triggers remain unchanged: ddsOnEditStamp, showroomTransferOnEdit, showroomTransferOnChange (owned by another user). Add only one showroomGridOnEdit trigger after QA PASS.
Rental, Telegram and Finance Bridge are untouched. Production financial operations, including manually repaired 57/58 and existing 49–52, have not been modified. A5:E1004 and N5:T1004 user-entered snapshots before/after this QA work compare equal. Fresh October 17 snapshots taken before the intended installation and after the browser interruption also compare exactly equal. The production source was reread on October 17 and still has original trimmed SHA-256 6633dd62d323979925d855974498b9355957312f7b3d4055a8f45fae878e4dd4 (10178 characters); no production source was changed.

Manual verification after installation: on QA enter date/type/account/operation/object/amount one cell at a time; confirm A:T and exactly one peer for each transfer direction; replay the amount and confirm no additional rows. In production verify source checksum, four intended triggers and nonfinancial filter edit only; create no test payments.
