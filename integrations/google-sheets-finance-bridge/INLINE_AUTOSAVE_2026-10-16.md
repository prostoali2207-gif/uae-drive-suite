# Inline autosave investigation — 2026-10-16

## Confirmed live failure
Production bound project: 1NuFbHLkGWDcU570lTeq_Uz4DouFapBAtEPPBSlmycT9XyrOkMl2YtPih. ShowroomGrid source matched the repository source inspected before changes. Installed triggers: ddsOnEditStamp, showroomTransferOnEdit and showroomTransferOnChange, one each; owned by another user.

Production executions on 2026-10-15 at 20:36:27 and 20:36:49 Asia/Dubai log: `В строке 57 была повреждена связь с данными. Показаны исходные значения; повторите ввод.` The earlier execution also logs rejection by strict validation in U57. The mirror guard rejects unmarked static cells outside the current event range, including rapid sequential edits to a previously empty journal row before a draft note exists. Restore writes formulas returning empty strings into cells with strict date, numeric and dropdown validation.

## Candidate, not installed
Preserve unmarked drafts only when financial storage and source/pair identities are empty; retain shifted-formula rejection and occupied-row protection. Preserve blank mirrors as actual blank cells. Mark drafts without rewriting all input fields. On an identical retry, run existing transfer reconciliation so an interrupted source/pair sequence can finish.

15 Node regression tests PASS. Live Google QA has NOT passed; no production installation or main-branch merge is authorized by a QA PASS yet.

## Isolated QA
Spreadsheet: https://docs.google.com/spreadsheets/d/104iWDidknXzuYrNe8bQtf4lRUFsdJVCgWRQ06jTRr3s/edit
Bound script: https://script.google.com/u/0/home/projects/1sd_3kZg09wAy4gUV78uchfsfBMv8gQ_z0epHC066enQpvMNegF7g61R_/edit
Copied core Rental and Showroom IDs and transfer ID were redirected to the QA spreadsheet. No installed production triggers were copied or changed. Draft runner qaAutosaveRun is ready in the QA ShowroomGrid; it verifies target IDs before writing. Prior attempts from a simple trigger hit Google's 30-second execution limit. Editor execution requires Google OAuth consent, currently not granted.

## Remaining gate
Authorize the isolated QA project, then run qaAutosaveRun and inspect all expected checks: income, expense, both transfer directions, same-row replay, cross-row duplicate, missing-pair recovery, strict validation, rapid input. If any fail, fix and repeat before publishing. The copied runner mutates only its QA spreadsheet. Production historical operations including rows 49–58 were not modified. A5:E1004 and N5:T1004 user-entered values were snapshotted and compared unchanged during the investigation.

Manual verification after installation: use the QA copy to enter date/type/account/operation/optional object/amount sequentially; check A:T and exactly one counterpart for transfers. Re-enter the same amount and check row count stays unchanged. Do not create test entries in production.
