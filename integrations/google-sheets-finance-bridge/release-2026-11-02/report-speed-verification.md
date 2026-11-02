# Report refresh performance and B2 month format — 2026-11-02

## Change
- Month B2 now uses DATE `mmmm yyyy` in both public Month and hidden calculation copy. Underlying date serial46327 and financial formulas are preserved. Browser displays the month name; installer retains this format for future setup.
- Replace staging setValues + PASTE_VALUES + clear with one captured-snapshot setValues into the existing values-only report. Formats, validation and literal-text escaping stay intact. Check selected period before and after publication; a post-write race returns pending and refresh recovers.
- Hidden report B102 validation is retained and passed native writes. No financial journal, Rental, source-row mapping, autosave or API endpoint changes.

## Native QA
Existing private QA copy `1BGeoJsMTceR_VQFai8TP9t7svdQm9dW4EDPYG0V_8p0`, four alternating full refreshes. Every timing includes flush; each report was compared exactly against hidden calculation and checked for absence of visible formulas.

| Attempt | Existing staging path | Direct captured values |
|---|---:|---:|
| 1 | 23.181s | 10.814s |
| 2 | 15.537s | 9.891s |
| Mean | 19.359s | 10.353s |

46.5% less server refresh time (1.87x). This measures report refresh on the same QA workbook, not initial browser loading or a guarantee for all network conditions.

09:38:46 Dubai: `FAST_REPORT_QA_PASS; journal unchanged; report equal; no formulas`. No monetary test records were added. A5:T1004 values/formulas before and after matched exactly.

Local: report tests cover no-op writes, accidental edit repair, a pre-write period race, post-write pending recovery and literal escaping; compact25 and queue9 scenarios pass.

## Publication
Bound Grid and standalone API source readbacks match repository concatenations. Temporary QA wrapper removed. Existing API deployment updated to version22 at09:40 Dubai with the same URL, execution identity and access settings.

Manual: use B2 to switch October/November, wait for `✓ Всё сходится`, confirm dates/totals follow the month and B2 shows its name. Financial operations must be entered through Ввод операций.

Live acceptance: original browser October→November switched successfully; both month captions retained the name format and control returned to `✓ Всё сходится`. November operation count4. Final A1:T1004 user-entered and effective CellData exactly match the pre-change snapshot. Screenshot month-name.jpg. Existing API URL retained; no financial transactions created in production or QA for this task.
