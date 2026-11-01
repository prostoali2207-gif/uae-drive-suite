# Values-only visible sheets — 2026-11-01

Status: Published. Production migration completed at 21:18 Dubai; final browser and source-preservation checks below.

## Design

Visible `Ввод операций!U:AA` contains saved raw values. Hidden `_Ввод_значения` is the published baseline, so a real draft remains distinguishable from a saved row. AB/AC mapping, source signatures, view generations, month date validation and durable autosave continue to protect A:T. AB1 remains `sgi.compact.v1`; AB2 enables `sgi.values.v1` only after explicit migration.

`Месяц` formulas move to hidden `_Месяц_расчёт`; its B2 follows the visible selector. A captured, period-checked snapshot is pasted as values to the visible report. G2 retains navigation as a rich-text link. `_Месяц_значения` stages captured values, with literal `=` strings escaped. A report cursor avoids unchanged writes but also checks public values to repair accidental owner edits.

A separate narrow `showroomValuesOnEdit` listener refreshes the report as the authorized owner. It never posts financial transactions or duplicates the grid listener. The existing recovery timer also refreshes values and report. The API recognizes the published baseline and refreshes the report after showroom writes. Existing API URL and Rental logic are preserved.

## QA evidence

Private copy: `1BGeoJsMTceR_VQFai8TP9t7svdQm9dW4EDPYG0V_8p0`.
Candidate functions execute inside a local scope hardbound to that ID; production global handlers remain unchanged until QA passes.

Initial native migration proved exact A5:T1004 values/formulas preservation, exact report values preservation and no formulas in either visible sheet. A native test caught a baseline date-format defect: PASTE_VALUES into a General cell returns a numeric serial instead of Date. The installer now formats baseline A5:A1004 as dates before pasting. No production financial data was changed.

All existing local bridge test files pass. Compact tests include 25 scenarios, including six values-view cases. Report tests check unchanged writes, accidental owner edits, period races before publication, and literal text staging.

## Native acceptance

- 21:08:25 `VALUES_NATIVE_QA_PASS`: amount edits update the mapped source, report expense follows the edit, restoring the amount restores the full journal snapshot; far draft survives attempted month change; saved raw rows do not block switching; repeated switching leaves no visible formulas; a 0.47 transfer creates exactly two rows and retry does not duplicate them; an accidental public report edit is repaired.
- 21:09:39 `VALUES_API_NATIVE_QA_PASS`: saved raw rows pass inspection; a zero draft blocks inspection; literal equals text remains text; a QA 0.33 posting and same-ID retry produce exactly one source row and update the report.
- 21:15:09 `VALUES_PERIODS_NATIVE_QA_PASS`: actual nonempty September and November reports match the hidden live calculation, including positive operation counts and expenses.
- All monetary test entries were confined to the QA workbook. Initial tests exposed and corrected the baseline date format; a test setup also had to use actual Dubai-midnight period dates instead of assuming all dropdown source cells returned Date objects.

## Production publication

- Existing API deployment updated to version21 at21:12 Dubai, with the same deployment ID and URL.
- Bound Grid is exactly Grid + Compact + Values + ReportValues; Entry contains report notifications. Temporary QA/publication wrappers were removed.
- 21:18:17 migration logged `journalUnchanged:true`, `reportUnchanged:true`, `visibleFormulas:0`.
- Independent bounded Sheets read found zero changes to any user-entered A1:T1004 journal values/formulas; Main values/formulas also match the snapshot. Input U:AH and Month A:J contain no formulas.
- Browser double-click on production Month D11 exposed ordinary `3668,5`, with no formula. Input Z5 double-click also exposed ordinary `810`, without a formula. No value was typed in either check; editing was cancelled with Escape. Screenshot: values-double-click.jpg.
- Browser period selection November→October updated report dates, totals and operation count; status returned to `✓ Всё сходится`. The original November selection was restored; the report returned to four operations, expense1020, and `✓ Всё сходится`.
- Six triggers present: the existing single grid edit handler, new own `showroomValuesOnEdit`, stamp, transfer edit/change and recovery timer. New listener error rate0% at verification; no duplicate grid handler was installed.
- Fixed November's missing number format in hidden `_ДДС!I2:I5` period source using DATE `mmmm yyyy`, so its dropdown label shows the month rather than serial46327. No cell value or formula was changed by this format update.
