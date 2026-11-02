# Deeper performance experiment — 2026-11-02

## Safety and scope
All architectural experiments ran only on the existing private QA workbook1BGeoJsMTceR_VQFai8TP9t7svdQm9dW4EDPYG0V_8p0. No production financial data, formulas or history changed. Source journal A:T, real-draft guards, month date bounds, source signatures and API endpoint retained.

## Rejected: live prepared report copies
Built four fixed-period hidden copies (August–November), replacing192 INDIRECT calls per report with direct month-sheet references and local period helpers. All635 report formulas remained live. Every A3:J346 value matched the legacy calculator exactly for all four periods; source journal unchanged. PRECOMPUTED_ALL_MONTHS_QA_PASS at13:46 Dubai.

Actual month-switch measurements, including selector write and flush:
- Existing report path:13.668s and12.395s.
- Prepared live report path:16.977s and18.277s.
- Existing input projection:26.523s and27.503s.
- Direct-baseline input projection candidate:26.283s and27.831s.

The prepared-report mechanism was slower; the input rewrite gave no meaningful gain. Neither was published. QA source comparisons and genuine unfinished-input preservation passed, but correctness alone did not qualify these candidates for release. Added live copies were converted to inactive values in QA after the experiment, and their temporary marker cleared. Production never received the cache sheets or marker.

## Remaining candidate: bounded report writes
Read the calculated and displayed report, compute the smallest rectangle covering actual differences, and publish only that captured rectangle. Keep selected-period checks before and after writes. Identical reports produce no write; owner edits still repair. Remove redundant digest/property bookkeeping. No extra live formulas or persisted report cache introduced.

Native alternating repair measurements after withdrawing the live copies:
- Full report write:16.318s and14.247s (mean15.283s).
- Bounded write of the actually changed cell:14.013s and13.895s (mean13.954s).
- Every full report value still matched the calculator and the journal snapshot was unchanged. INCREMENTAL_REPORT_QA_PASS at14:02:52 Dubai.

This is a small8.7% mean improvement in this particular repair workload, not evidence of instant month switching. The smaller warm pair differs by only0.352s. No stronger speed claim is justified. Bounded writing also avoids republishing3439 unchanged cells in this scenario.

## Financial acceptance
14:07:26 Dubai INCREMENTAL_FINANCIAL_QA_PASS: changed an existing October AJMAN expense by0.01 only in QA; October expense moved by0.01, November expense stayed unchanged, and November carried bank balance moved by−0.01. Both entire reports matched the original calculator. Restored the test amount in finally; full journal values/formulas returned exactly to their original snapshot. Public report contained no formulas.

Final implementation is bounded report writing only. No prepared-report marker, extra live report sheets, input projection rewrite or financial calculation rewrite is released.

## Publication and live verification
Published bounded writing in bound Grid and existing API version23 at14:09 Dubai, preserving deployment URL and access settings. Both source readbacks match repository concatenations; all temporary QA functions removed. No new services/scopes enabled.

Production A1:T1004 journal, Month A1:J346 and Main A1:M95 user-entered/effective snapshots exactly match before/after publication. Public report has zero differences from the live calculator and zero formulas. Existing source-month/date/draft behavior is unchanged. Compact26, queue9, correction37 and report boundary/period-race tests pass.
