# Showroom duplicate guard — production verification, 2026-10-16

## Installed version

Existing standalone Finance Bridge project: 15st3EDVyLrETA8EttAeA0lfsbf9DYMN7KwTNmNktLDke3jPYIgcSWq1u.
Existing deployment was updated from version 13 to version 14; its ID and /exec URL were retained. Execution identity and access settings were unchanged.

Production source is captured exactly in Code.deployed.gs. The editor was reloaded and its complete source compared byte-for-byte with this file before deployment.
Code.gs (GitHub blob 93405c7b8bdd80bf5ed95e3aace8528fdacadeb8) contains additional unrelated functionality absent from the live project. Its duplicate guard was transplanted into the actual v13 source without replacing the newer live correction/driver logic. Only 43 lines were added: 42 guard lines and one showroom-only GET health marker. No existing lines were removed. Existing Code.gs was preserved.

## Verified failure mechanisms

The deployed v13 Bridge still accepted showroom record_entry requests without a stable request_id. A retry with a different ID was treated as a new posting; there was no content duplicate gate. An existing ID also did not verify that incoming date/account/article/amount/note still matched the saved operation before invoking transfer/display helpers.
The separate bound-sheet ShowroomGrid fixes do not update a standalone web-app deployment. Updating source alone also does not advance a versioned /exec deployment.
The prior grid regression covers shifted mirror formulas and unmarked pasted values, which could otherwise be mistaken for a new draft. Those existing fixes were retained.
Rows 49–52 were not modified. Their original submission channel cannot be established retrospectively from the duplicate values alone.

## Changes

For showroom only, record_entry requires a stable 8–200 character request ID. Same-ID replay with the original payload returns the original row; conflicting payload is rejected before writes. A fresh ID with matching date/account/article/amount/normalized note is rejected with an explanatory warning and row number. A separate payment can be recorded with a separate explanation and ID. Automatic transfer counterpart rows are excluded from this duplicate scan.
Rental retains its previous optional-ID contract. Existing transfer/correction/driver routines and API URL were preserved.
GET showroom now reports duplicate_guard=request-id-and-content-v1. Rental GET is unchanged.

## Executed checks

- Existing GitHub request-ID test against the fetched Code.gs: PASS.
- showroom-bridge-deployed.test.cjs against exact installed source: PASS (required/malformed IDs, same-ID replay, conflicting amount/note, different-ID duplicate, explained second payment, unchanged Rental optional-ID behavior).
- ShowroomGrid regression: 12 PASS; entry form double-submit/retry tests: PASS.
- Apps Script execution against isolated spreadsheet 1cFB3SEBZqhdMoS_cjd8YnjWGDWtdwZeIOMGh6_BtoHw: 8 PASS before protection, and again with warning-only A5:E1004 protection. Both spreadsheet constants were redirected to the copy; runner rejects any production target.
- Eight checks: same ID/payload -> one posting; changed amount under same ID rejected; fresh ID/same payment rejected; missing ID rejected; two real equal payments with distinct explanations accepted; cash -> AJMAN replay keeps one pair; AJMAN -> cash replay keeps one pair; sidebar replay creates one posting.
- Strict protection on the COPY excluding the script-running editor caused protected-range errors in both Bridge transfer handling and sidebar. It was replaced with warning-only on the copy; strict protection was NOT installed in production.
- Manual paste into QA E900 displayed “Вы пытаетесь изменить защищенный диапазон. Продолжить?”; Cancel was selected.
- Production A5:E1004 now has warning-only protection (ID 560577408). It changes no operation data and does not block scripts.
- Existing production /exec GET ledger=showroom returned ok=true and duplicate_guard=request-id-and-content-v1 after deployment. GET ledger=rental returned ok=true with its original spreadsheet ID.
- Production user-entered values in A5:E1004 and N5:T1004 matched exactly before/after all work, including rows 49–52. No test payment was submitted to production. No Rental data was written.

## Remaining boundaries

Warning-only protection can be confirmed or suppressed for five minutes by an editor; direct A:E writes by editors/owners or other scripts can bypass application checks. A changed explanation intentionally permits a separate payment and can therefore be misused. The bound-sheet project and standalone Bridge have separate Apps Script locks: a simultaneous first write through different projects is not globally serialized; this cross-channel race was not claimed eliminated or stress-tested.
Telegram transport itself was not used to create a production payment. Its record_entry handler was exercised directly on the copy; full bot delivery/authentication was not retested.
These boundaries require a single authorized writer or stronger identity separation to eliminate completely; blanket range locking was rejected because it breaks the existing writers.
