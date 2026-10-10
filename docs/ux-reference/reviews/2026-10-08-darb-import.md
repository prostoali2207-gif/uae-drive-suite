# Darb import UX benchmark — 2026-10-08

**Manager job:** move official Darb toll crossings into FleetDesk with correct vehicles/contracts and no accidental double billing.

**Operational source of truth:** Darb's transaction history for crossing/amount; FleetDesk's `cars`, `contracts`, `contract_vehicles` for assignment; existing Supabase Salik ledger and its timestamp-aware assignment trigger for billing.

**Comparable patterns reviewed (behavior):**
1. FleetDesk's existing Salik Excel import — compact entry point next to relevant transaction list. Reuse the location, not its immediate write-without-preview behavior.
2. GOV.UK Design System form validation/review principles (documented pattern) — strict required fields, explain invalid values, preserve input after errors.
3. PatternFly/IBM Carbon enterprise data patterns (documented pattern) — short summary counts, batch preview with row-level status, keep exceptions visible and preserve comparison.

**Best transfer:** one upload/paste decision; preview statuses (ready, unlinked, duplicate, invalid); explicit amount/row scope before import; separate completion counts. No large wizard or extra navigation.

**Rejected:** silent mapping of changing headers; one-click write; deriving client from contract closure timestamp instead of actual vehicle segment; overwrite on duplicate; decorative per-row cards on desktop; automatic charging.

**Risks:** missing source seconds/plate code, multiple identical same-minute crossings, overlapping contracts, tenant access, 390px preview width, source ID stability, Darb page changes. When an original transaction ID is unavailable, deterministic fallback may collapse truly identical crossings — these need manual review/source ID to distinguish.

**UX contract:** Toll Charges → Import Darb → file/paste → preview all rows → commit eligible → show inserted/skipped/failed. Bad format is rejected; unlinked rows stay unpaid; unknown/ambiguous vehicles are never imported. Recover by choosing a corrected file without losing the previous input before saving. On small screens preview becomes a condensed vertical list. IDs/plate/time remain readable LTR.

**Business scope:** no deposit/payment/vehicle availability changes, no new routes/auth/schema, no adjustment to Salik import, no pre-existing payment mutation. Reuse source-prefixed records in the existing ledger. Service fee is 0 AED unless Darb pricing policy is separately specified.

**Evidence level:** existing FleetDesk source inspected directly; GOV.UK/PatternFly/Carbon principles from referenced UX skill guidance; Darb authenticated list DOM and runtime/browser operation not yet observed.

**Gate:** UX CONTRACT READY for source-driven file import; visual and end-to-end QA RUNTIME UNVERIFIED until actual build/browser run.
