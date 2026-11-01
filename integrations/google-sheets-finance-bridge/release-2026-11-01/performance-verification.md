# Showroom workbook performance — 2026-11-01

## Findings
- Month projection republished1000 rows,2000 mapping/signature cells and7000 validation cells for every selection, with five explicit flush barriers.
- Simple onOpen reset a shared valid historical-month selector to the current month and rewrote its validation even when unchanged.
- _ДДС had2000 per-row FILTER anchors running even with empty input controls. There are11042 helper formulas, including the review pipeline.
- Measured financial month sheet formula counts: August13164, September13218, October13939, November13928; total54249. Month report has636 formulas,192 containing INDIRECT. The report and historical financial formulas remain live and unchanged.
- Five installed triggers observed: one grid OnEdit owned by another account, manual stamp, transfer OnEdit, transfer OnChange, recovery timer. No trigger added or removed.

## Changes
- Read controls, source, mapping, cursor and digest in a single coherent values snapshot plus formulas read; retains full-range draft detection, including far-down input.
- Publish only max(old occupied projection,new records plus one input row), clearing previous longer views. Legacy empty signatures cleared on first changed render.
- Preserve dependent dropdown/amount/note validation in place; update only date bounds with finally restoration. Two flush barriers preserve ready-state ordering. Clear the staging formulas after native paste.
- Opening a new tab preserves an already valid shared month selection; unchanged selector validation causes no write.
- Add lazy empty-control guards to _ДДС AJ5:AJ1004 and BO5:BO1004. Idempotent, grounded migration builder in dropdown-performance-migration.cjs.
- No additional service enabled. Sheets service dialog was cancelled. API deployment and URL remain v20; no Rental or finance calculation change.

## Native QA
QA workbook1B2JraDVMC4Ps3j_seaEsVQiTZvS3u13iiN3No3qUa6Q, invoked through function-local candidate copies from the already authorized bound project; temporary wrappers removed before final publication.

Same-workbook baseline: September34.736s, November34.711s.
Intermediate candidate:24.264–25.345s, then22.137s.
Final candidate (18:29–18:30 Dubai): September12.311s, November12.365s, September15.164s, November15.140s. Mean13.745s vs34.724s baseline, approximately2.5x faster /60% lower server execution time. This is measured script render time on QA; it is not a promise about browser/network startup latency.

PERFORMANCE_QA_PASS: entire A5:T1004 values/formulas unchanged; long→short view cleaned; far-row draft preserved across attempted switch; wrong-month date blocked; native formulas survive buffer clearing. Full AJ5:CH1004 spilled dropdown output comparison before/after2000 guards: zero effective-value differences.

Local: compact19, grid14, durable queue9, month boundaries11, no-op opening test, entry-form and corrections37 scenarios passed (43 Node test entries total; grouped scenario suites report their own counts).

## Production verification
- Saved bound Grid as exact concatenation of repository Grid and Compact; reread matched; QA helper absent.
- Updated exactly2000 hidden dropdown anchors, preserving original nonempty selection formula.
- Browser switched original October→November→October. November ready showed original four records at rows5–8 and empty row9. Original October selection restored.
- Final A5:T1004, Month A1:J346 and Main A1:M95 userEnteredValue/effectiveValue comparisons matched exactly. Full production AJ5:CH1004 spilled dropdown output comparison: zero effective-value differences.
- Reopened the original workbook in a fresh browser tab: October selection preserved; ready banner confirmed. AF notification equals AG acknowledged cursor; staging A5:I100 is empty. Original browser tab retained.

## Remaining cost
The workbook retains54249 financial-month formulas and192 INDIRECT-based Month formulas. Converting history to fixed values would change historical-edit behavior and was not used. Initial browser loading still depends on Google Sheets and network latency; this release removes redundant opening writes and unnecessary dropdown scans without changing accounting.

Manual: select a month in X3, wait for ВВОД; reopen in another tab and confirm the selected month stays. Finish or clear drafts before switching.
