# Month switch blocked by accumulated drafts — 2026-11-05

Original showroom workbook and input sheet 589146974 retained.

Root cause: sgvCheckRow_ compared every cell outside the latest edit event with the saved baseline. A normally accumulated row draft (date, type, account, operation, then amount) could be rejected before completion. Its blocked queue event and nonempty draft then prevented sgcRender_ from switching months. This was not the earlier date-format issue.

Fix: remove the event-column equality restriction from values-mode row checking. Formula rejection remains. sgiRow_ still validates complete row, month, operation, object, amount, duplicate detection, source signature and view generation before canonical writes. Existing draft preservation remains.

Live publication: changed only this guard in the exact live concatenated ShowroomGrid.gs; saved and copied back through editor; normalized full content matches. Repository ShowroomValues.gs updated in cbbac78db90bb574a10647e897331937402c03bb.

Recovery: complete visible rows 10–12 were replayed through existing showroomGridOnEdit with all seven columns under the existing queue protocol. Rows 10 and 11 saved as canonical 110 and111 (120 and80 AED); row12 updated canonical108 to the user's visible cash570 AED. Existing note signature matched source before update. A temporary recovery helper initially refused a differing canonical row; it made no writes on that refusal. Corrected helper completed successfully in187.863 seconds; helper removed afterward. No direct manual journal writes, new financial test transactions or trigger installations.

Verification: accumulated draft passes row check; formula input still rejected. Browser November→October opened with X3/AC1=October, ready banner and first operation at row5. October→November subsequently reached matching X3/AC1=November and ready banner. Canonical readback confirmed570,120,80 and existing100 AED record. Final selection requested October again. Lock contention can delay transitions until recovery timer; speed was not changed.
