# Approved FleetDesk UX Patterns

Use these as defaults, not rigid laws. Rental Ops and task evidence may justify a different pattern.

## 1. Import → Preview → Resolve → Commit → Result

Use for Salik, parking, fines, clients, vehicles, and statement imports.

- Never write records immediately after file upload.
- Show totals, ready records, duplicates, missing data, and uncertain matches.
- Keep routine rows separate from exceptions.
- Allow repeated correction without losing the uploaded file or completed work.
- Commit once, prevent double submission, then show exact created/skipped/failed counts.

## 2. List → Search/Filter → Select → Contextual action

Use for repeated operational work.

- Search by identifiers managers actually know.
- Keep active filter count visible and provide clear-all.
- Row actions belong to the row; bulk actions appear only after selection.
- Show selected count and scope clearly.
- Preserve search, filters, selection, and scroll after returning from detail where practical.

## 3. Primary list + detail context

Use when managers compare many records while inspecting one record deeply.

- Opening detail must not destroy the list context.
- Row focus and bulk selection are separate states.
- Multiple selected rows must not pretend to show one record's details.
- Detail pane must show decision-critical contract, customer, vehicle, dates, money, and source information.

## 4. Review before consequential action

Use before contract activation/closure, deposit refund/capture, payment correction, destructive changes, or financial reconciliation.

- Summarize only decision-critical facts.
- Show current state and resulting state.
- Allow targeted correction without restarting.
- Primary button names the actual outcome, not “Submit”.
- Do not add confirmation dialogs to routine reversible actions.

## 5. Exception queue

Use when imported or calculated records cannot be safely processed automatically.

- Keep normal records out of the queue.
- Explain why each item is uncertain.
- Show candidate matches and evidence.
- Support defer, dispute, assign, or exclude where business rules allow.
- Record the manager decision and source.

## 6. Return and reconciliation

Treat physical return and financial closure as separate milestones.

- Capture return facts first: vehicle, time, odometer, fuel, condition.
- Then reconcile rent, payments, fines, Salik, damages, overage, and deposit.
- Never display “closed” if unresolved financial items remain unless the status explicitly means physically returned.
- Show balance before and after each adjustment.

## 7. Error and recovery

- State what failed and what the manager should do.
- Preserve valid input and completed steps.
- Never show success before server confirmation.
- For long operations, show meaningful stage or final counts, not an endless spinner.
- Prevent double submission and duplicate imports.

## 8. Mobile and RTL

- Keep the primary action reachable without precision tapping.
- Avoid wide mandatory tables for core mobile tasks; use compact summaries and drill-down.
- Arabic layout mirrors direction, but plate numbers, phone numbers, contract IDs, amounts, and timestamps keep readable LTR formatting where appropriate.
- Test mixed Arabic/English text rather than only flipping CSS direction.
