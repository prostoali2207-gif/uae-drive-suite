# Darb fixed-format import (FleetDesk)

## Status
- Darb's official public website documents account transactions, but **no documented public customer transaction API was confirmed**. Do not call undocumented private endpoints or collect account passwords.
- The authenticated Darb transaction list's actual HTML structure is not available in this repository. Do **not** assume a browser scraper for all pages is validated until it is tested with a real Darb session.
- Import is available inside **Fines & Tolls → Toll Charges → Import Darb**.
- The existing `salik` ledger is reused for compatibility with contract balances, payment allocations, and timeline reconciliation. Darb is unambiguously distinguished by a `DARB:` transaction ID prefix and `Darb —` toll gate label. No database schema changes.

## Canonical file format
Exactly these headers (case-sensitive), preferably saved as UTF-8 CSV:

```csv
Transaction ID,Plate,Date,Time,Gate,Amount
```

One crossing per row. `Transaction ID` values can be blank if Darb does not expose them; the importer requires original seconds and then constructs a deterministic key from all the remaining fields. Use full plate text including any plate code when available. Darb's verified Ajman Private format (e.g. `A AJMAN PRIVATE 12345`) matches FleetDesk's abbreviated Ajman plate (`A 12345`); matching a plate on digits alone is forbidden. Dates must be `YYYY-MM-DD`, times **`HH:mm:ss` when ID is blank** (and `HH:mm` or `HH:mm:ss` when source ID exists) in Abu Dhabi local time (UTC+04:00), and Amount the **actual amount in AED** from Darb. Never infer a toll charge from a gate crossing alone or insert a fabricated ID/time/amount.

Codex browser task (for a logged-in Darb transaction list):

> Read only real Darb toll **transaction rows** visible in the browser. For every page, append one CSV row in exactly the column order `Transaction ID,Plate,Date,Time,Gate,Amount`. Keep original IDs if shown, otherwise leave the first column empty. Normalize dates to YYYY-MM-DD, times to original 24-hour HH:mm:ss in Abu Dhabi time, and amounts to numbers in AED. If a value is missing or unclear, do not invent it; preserve a blank field so FleetDesk rejects or flags it. Escape commas/quotes using standard CSV quoting. Process every requested page, not just the visible first page. Do not include balance top-ups, fines, or wallet transactions. Do not save login credentials. Output only the CSV file.

The importer validates the format itself, so changing Codex wording later cannot silently remap columns.

## Manager workflow
1. Export Darb transactions to the canonical file or paste CSV.
2. Preview matched clients, unlinked charges, duplicate keys, and invalid rows.
3. Confirm how many operations and how many AED will be imported.
4. Save explicitly; the same transaction cannot overwrite an existing paid charge.
5. Review any unlinked/invalid operations before billing a client.

**No automatic billing** on import. Entries start Unpaid. The exact crossing time is used with vehicle replacements and actual contract start/end via the existing database trigger. Ambiguous cars/contracts are excluded before saving. Original Darb amount is recorded without an added FleetDesk service fee (0 AED) until a separately specified policy exists.

## Manual acceptance tests (do not use real customer charges as test data)
- Upload one valid row; preview the vehicle and contract; verify saved amount and Darb label.
- Import the same file again; ensure zero newly inserted rows and no status/amount change.
- Try a wrong/missing header, zero amount, impossible date, unknown/ambiguous plate, and empty time.
- Use a crossing before collection, after actual vehicle return, and around a vehicle swap; ensure it is not charged to the wrong contract.
- Check an unlinked row cannot be billed from the toll charges table.
- Test import preview and final counts on 390px mobile and an Arabic/Russian mixed plate string.

The supplied Codex ZIP was inspected on 2026-10-10. Its two exact-time CSV files have the required 6 headers, **90 unique source rows totaling 360 AED** (September: 60 / 240; October 1–8: 30 / 120). All IDs are blank; times are HH:mm:ss; all 10 source Ajman Private plate code/number combinations were verified as uniquely matching FleetDesk's shortened plate representation by read-only SQL. Read-only timeline checks matched **88 crossings to contracts**, while **2 are unlinked**; preview and manual review must preserve them unlinked. No customer transactions were inserted. A corrected user archive `Darb_FleetDesk_Ready.zip` contains just the original exact-time CSVs, the exporter defaulting to exact seconds, and a single installation bookmarklet. This customer-data archive is not committed to the repository. Darb browser script behavior remains **unverified on a live authenticated page**.
