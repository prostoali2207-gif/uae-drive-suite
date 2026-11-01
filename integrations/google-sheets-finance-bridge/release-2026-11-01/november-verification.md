# November 2026 rollover

- Created November 2026 (sheetId 463272026) by native duplication of October; preserved formulas and formatting.
- B1 is 2026-11-01; date headers cover November 1–30; day31 cleared.
- Cleared copied literal transaction cells E37, E38, BX136 only in the new sheet; no October changes.
- November opening C3 links live to October BM155 (7234.5 AED); BQ3 links to October EA155 (-22892 AED).
- Added November to _ДДС I5, expanded Month B2 validation to I2:I5, selected November.
- Month displayed three existing November entries and passed reconciliation. Manager edited November amounts concurrently during verification; those edits were preserved. No financial journal cells were written by this release.
- Full October A1:FO181 user-entered and effective snapshot unchanged after sheet creation.
- Existing journal comparison found only concurrent manager change D106 (40→110), later additional November edits. No reversal or overwrite performed.
- Bridge v18 deployed to existing URL, preserving other v17 code. activePeriod showroom now reads _ДДС E2 instead of hardcoded October; cache namespace v3.
- VM target checks passed for November and December boundaries.
- Live GET existing /exec?ledger=showroom returned ok:true and period start 2026-11-01, end 2026-11-30, label November 2026.
- No production test payments. Rental unchanged.

This release does not add a scheduled month creation trigger; new month creation remains a maintenance operation. Dynamic API period follows the active month once created.
