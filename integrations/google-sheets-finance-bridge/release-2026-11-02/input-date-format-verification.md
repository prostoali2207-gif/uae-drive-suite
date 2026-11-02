# Input row55 date and blocked month switch — 2026-11-02

Root cause: production U55 had General formatting, while the hidden published baseline A55 was DATE_TIME. Both cells held serial46317 (22 October2026), but Apps Script returned a number for the visible cell and Date for the baseline. The draft guard therefore falsely treated an unchanged saved row as unfinished input and reverted November selection to October.

Evidence before repair: zero effective-value differences across U5:AA1004 versus the baseline A5:G1004; only populated U55 lacked DATE/DATE_TIME formatting. Source map AB55 points to financial row76. No financial value was changed.

Fix: restore DATE dd.mm.yyyy for visible U5:U1004, enforce it on every changed monthly projection before publishing values, and apply it during values-view installation. Existing draft guards stay intact.

Regression test models a Date pasted into a General-formatted visible cell and its numeric Apps Script return value. The fixed render publishes a proper Date, reports no false draft and permits month switching without A:T writes. Compact26, grid14, month11, queue9 and report tests pass.

Native QA on existing copy1BGeoJsMTceR_VQFai8TP9t7svdQm9dW4EDPYG0V_8p0: intentionally General-formatted U55 before publishing October; verified U55 becomes Date, October saved rows remain clean, November switches successfully and starts at row5. A real far-row unfinished note still blocks switching and survives intact. A5:T1004 values/formulas unchanged. 09:58:56 Dubai DATE_FORMAT_QA_PASS. No test financial transactions created.

Publication: exact Grid + Compact + Values + ReportValues concatenation saved and read back. QA wrapper removed. API remains version22 at its existing URL; no API or Rental behavior changed.

Live repair: U55 displayed22.10.2026 immediately after formatting. Selected November through the connected Sheets control cell; existing recovery rendered the original four November records at U5:AA8, mapped to source104–107, with blank input row9. No draft values were cleared. Browser screenshots on the original user tab repeatedly timed out; native CellData and source readback were used for the verification instead of claiming a screenshot-based interaction.

Final live state: X3=Ноябрь2026, Y3=ВВОД:Ноябрь2026 and AC1=Ноябрь2026. Full canonical comparison of1572 nonempty A1:T1004 user-entered/effective cells found zero differences. Screenshot capture also timed out in a fresh local browser tab; no screenshot-based acceptance is claimed.
