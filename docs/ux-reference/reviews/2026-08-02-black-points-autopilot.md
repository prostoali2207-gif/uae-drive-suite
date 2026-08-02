# UX benchmark: black points autopilot

Date: 2026-08-02
Status: accepted

## Manager job

When a linked traffic fine carries black points, the manager needs FleetDesk to prepare the authority form from the client, contract, vehicle and fine records without retyping data.

## FleetDesk constraints

- Rental-operations rules: the linked contract and client remain the source of truth; generating a form must not change the fine amount, payment state, deposit or vehicle availability.
- Data source of truth: `clients.unified_number`, linked `fines`, `contracts` and `cars` rows.
- Financial or availability risk: none from PDF generation; legal/operational risk exists if the wrong driver or incomplete UID is submitted.
- Mobile / RTL constraints: one-column review at 390px; identifiers remain LTR inside Arabic layouts.

## References reviewed

### Reference 1 — FleetDesk external forms fill flow

- Comparable job: select a fine and prepare an authority PDF.
- Observed interaction: one fine selector, linked-record summary and one create action.
- Why it works: it reuses existing links and keeps the manager on one screen.
- What FleetDesk can reuse: progressive disclosure and explicit missing-data blocking.
- What FleetDesk must reject: silently leaving government identifiers blank.
- Evidence: direct observation

### Reference 2 — GOV.UK check answers pattern

- Comparable job: verify consequential information before producing a submission.
- Observed interaction: show sourced answers and block completion when required answers are absent.
- Why it works: catches wrong-person and missing-data errors before submission.
- What FleetDesk can reuse: concise linked-record review and actionable missing fields.
- What FleetDesk must reject: a long wizard for a single generated document.
- Evidence: documented guidance

### Reference 3 — PatternFly progressive disclosure

- Comparable job: keep the normal path short while surfacing exceptions.
- Observed interaction: normal records expose the primary action; incomplete records show the specific exception.
- Why it works: daily work stays fast and uncertain records cannot pass silently.
- What FleetDesk can reuse: one primary action and visible exception text.
- What FleetDesk must reject: a separate dashboard made only for one form.
- Evidence: documented guidance

## Comparison

- Fastest normal path: choose a black-points fine and create the already-filled PDF.
- Safest consequential path: require the linked client, contract, vehicle, fine number, licence number and UID before generation.
- Best bulk / repeated-work pattern: reuse stored UID for every later fine; no bulk submission yet.
- Best exception-handling pattern: name each missing field and keep the selected fine.
- Best mobile behavior: stacked review details and one full-width primary action.

## Recommendation

Recommended interaction model: extend the accepted External Forms fill dialog and client record instead of creating another module.

Why it fits FleetDesk: it removes repeated typing while preserving the existing source-of-truth links and review step.

Patterns explicitly rejected: hidden blank UID, automatic government submission without a supported API, a new dashboard and a multi-step wizard.

## Scenarios to test

1. Linked fine and client with UID generates a PDF containing the UID.
2. Missing UID blocks generation and identifies `Unified Number (UID)`.
3. Client UID can be added and edited at 390px, then reused for the same fine.
