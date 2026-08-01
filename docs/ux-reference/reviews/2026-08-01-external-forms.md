# UX benchmark: external forms library

Date: 2026-08-01
Status: accepted

## Manager job

When an authority requests a standard document, the manager needs to find the correct blank PDF quickly, download or replace it, and later start an assisted fill flow without searching chats or folders.

## FleetDesk constraints

- Rental-operations rules: templates do not change contracts, money, vehicle availability, fines, Salik, parking, deposits or reconciliation.
- Data source of truth: template metadata in `external_form_templates`; PDF files in the private `external-form-templates` bucket.
- Financial or availability risk: none in phase one; wrong authority/emirate or outdated template is the main operational risk.
- Mobile / RTL constraints: usable at 390px without horizontal scrolling; Arabic titles and mixed LTR identifiers must remain readable.

## References reviewed

### Reference 1 — FleetDesk existing document panels

- Comparable job: locate and open a saved PDF.
- Observed interaction: compact document rows with direct actions.
- Why it works: familiar to current managers and requires no new navigation model.
- What FleetDesk can reuse: one record per document, visible filename/context and explicit action labels.
- What FleetDesk must reject: contract-bound document placement because these templates are reusable across contracts.
- Evidence: direct observation

### Reference 2 — IBM Carbon data table toolbar

- Comparable job: find one item in an operational collection.
- Observed interaction: search and filtering are grouped above the records; row actions have distinct targets.
- Why it works: reduces scanning and keeps global controls separate from item actions.
- What FleetDesk can reuse: one search field, one category filter and explicit per-template actions.
- What FleetDesk must reject: dense desktop-only columns and batch controls for a small, occasional library.
- Evidence: documented guidance

### Reference 3 — PatternFly empty state

- Comparable job: explain an empty collection and offer the next step.
- Observed interaction: short explanation with a single next action.
- Why it works: the manager is not left at a blank screen.
- What FleetDesk can reuse: a focused empty state with `Add template`.
- What FleetDesk must reject: decorative illustration that consumes mobile space.
- Evidence: documented guidance

### Reference 4 — GOV.UK check answers pattern

- Comparable job: verify consequential information before submission.
- Observed interaction: review entered information before the final action.
- Why it works: catches wrong details before a form is submitted.
- What FleetDesk can reuse: phase-two preview and review before email sending.
- What FleetDesk must reject: applying a review step to simple phase-one downloads.
- Evidence: documented guidance

## Comparison

- Fastest normal path: search or filter, then `Download`.
- Safest consequential path: phase two will require PDF preview before email sending.
- Best bulk / repeated-work pattern: search and category filter; no bulk action is justified yet.
- Best exception-handling pattern: visible load/upload errors with retry; preserve dialog fields after failure.
- Best mobile behavior: stacked template rows/cards with wrapping actions.

## Recommendation

Recommended interaction model: a dedicated `External Forms` page with a compact searchable list, category filter, one primary `Add template` action and explicit `Download`, `Replace` and disabled `Fill` actions.

Why it fits FleetDesk: it separates reusable authority forms from company documents and contract documents while keeping the common task to one screen.

Patterns explicitly rejected: settings tab, multi-step wizard in phase one, decorative card dashboard, bulk controls and automatic email sending without review.

## Scenarios to test

1. Empty library, add a valid PDF, then download it.
2. Search and category filter with long English and Arabic names on 390px.
3. Replace a template and confirm another tenant cannot access either metadata or file.
