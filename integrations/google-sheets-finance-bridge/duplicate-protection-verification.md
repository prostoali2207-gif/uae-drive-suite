# Showroom duplicate protection — verification 2026-10-15

## Confirmed defect
The production bound Apps Script had an older ShowroomGrid without the duplicate gate and new manual request IDs already present in GitHub. Its sidebar server allocated a fresh empty row for every submission and the browser did not retain a request identity. Replaying that submission could therefore create another journal operation. The installed trigger list contained one each of ddsOnEditStamp, showroomTransferOnEdit and showroomTransferOnChange; duplicate installed triggers were not found.

The historical event that produced rows 49–52 cannot be attributed to a particular UI action from the available evidence. These rows were preserved.

## Installed change
ShowroomGrid.gs, ShowroomEntry.gs and ShowroomEntryForm.html were saved in the production bound project. After a full editor reload, each source was read back and matched the tested candidate exactly; GitHub sources were fetched back and matched too. This updates bound manual handlers and the sidebar. No Finance Bridge deployment or URL was changed.

The sidebar retains one request ID across retries; the shared script lock and journal ID lookup return the existing row. Reuse with changed content is rejected. Exact duplicate content is blocked before a journal write. A separate payment with a different explanation remains possible, with a similar-payment warning. Existing mirror protections and Telegram IDs are preserved.

## Executed checks
- 12 Node ShowroomGrid regression tests passed, including shifted/stale mirrors, drafts, same-row edits, cross-row duplicate rejection and similar-payment detection with a distinct note.
- Sidebar client test passed: double-submit suppression; same ID after failure; new ID after confirmed success; warning survives reset.
- Isolated bound Google test completed PASS at 21:12:10 Asia/Dubai: form retry returns one row; duplicate blocked; separate payment accepted with warning; inline stable ID; inline retry keeps row count; inline edit updates same posting; cross-row replay blocked; transfer replay keeps one pair; transfer edit updates peer; Telegram recordEntry_ retry returns one posting.
- Test spreadsheet: https://docs.google.com/spreadsheets/d/1cFB3SEBZqhdMoS_cjd8YnjWGDWtdwZeIOMGh6_BtoHw/edit
- Production A5:E1004 and N5:T1004 user-entered cell contents were identical before and after installation. No production test postings were made.
- Production Код.gs, ShowroomTransfers.gs and ДДС_вид.gs were read back unchanged.

The isolated runner redirected all spreadsheet constants to the QA copy and checked its target before writing. It cleared validations only in QA U992:AA993 to prepare a batched synthetic edit; production validations were untouched. The expected duplicate rejection appears as a console error before the final PASS.

## Limits
Telegram was checked through its actual server handler on the QA copy, not by sending a live bot message. Direct edits to underlying A:E and external API callers omitting request_id bypass the new sidebar identity lifecycle. Separate payments with distinct notes remain intentionally allowed and warned. Existing duplicates were neither removed nor modified.
