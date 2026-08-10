# UX benchmark: Black Point Requests

Date: 2026-08-10
Status: implemented

## Manager job

Prepare the complete Sharjah black-points transfer package from an already-linked fine, review the exact PDF that will be sent, send it to the recipient stored on the authority template, and retain a visible audit record.

## FleetDesk constraints

- The linked fine, contract, client and vehicle remain the operational source of truth.
- Preparing or sending a request must not change fine amount, payment state, deposit, contract state or vehicle availability.
- Wrong-driver and incomplete-document errors are legal/operational risks, so sending requires a review step.
- The official blank form stays in Templates; completed cases belong in Black Point Requests.
- Mobile must remain one-column at 390px and identifiers/emails remain LTR.

## References reviewed

### 1. Existing FleetDesk External Forms

- Comparable job: select a black-points fine and create the authority PDF.
- Pattern: progressive disclosure with a linked-record summary and explicit missing-data blocking.
- Reuse: keep Templates as the source of the blank form and recipient email.
- Reject: mixing completed submissions into the template list.
- Evidence: direct observation.

### 2. GOV.UK Check answers

- Comparable job: review consequential information before final submission.
- Pattern: one concise review page immediately before the final send action.
- Reuse: show recipient, subject and exact attachment before Send.
- Reject: a long wizard for a small transaction.
- Evidence: documented guidance.

### 3. GOV.UK Confirmation pages

- Comparable job: prove a transaction completed and retain a record.
- Pattern: explicit completion state plus a downloadable record.
- Reuse: Sent status, sent timestamp and saved PDF package.
- Reject: success toast as the only audit evidence.
- Evidence: documented guidance.

### 4. PatternFly actionable list/table behavior

- Comparable job: repeated operational work on individual records.
- Pattern: keep row-specific actions on the record; expose status and exceptions inline.
- Reuse: Prepare / Review / PDF actions per fine and visible Missing data / Ready / Sent / Failed states.
- Reject: bulk submission before the single-case flow is proven safe.
- Evidence: documented guidance.

## Recommended interaction model

Use two tabs inside External Forms:

- `Templates` — blank authority PDFs and recipient metadata.
- `Black Point Requests` — concrete fine cases and their submission state.

Normal flow:

1. Open Black Point Requests.
2. Click Prepare on a valid fine.
3. Add only the fine screenshot; FleetDesk reuses stored client documents, contract, company Trade License and stamp.
4. FleetDesk builds and stores one PDF package.
5. Review To / Subject / Attachment and preview the PDF.
6. Send.
7. Row becomes Sent with timestamp and retained PDF.

## Risks to test

1. Missing client passport/licence blocks Prepare with the exact missing item.
2. Missing contract, UID/Traffic File Number, recipient email or company Trade License blocks preparation.
3. Package contains the filled form, passport, licence, fine screenshot, first contract page and Trade License in that order.
4. Company stamp appears on package pages when configured.
5. Repeated Send cannot create duplicate delivery while a request is already sending or already sent.
6. Failed email remains visible as Failed with the provider error and can be retried.
7. Company A cannot read Company B submissions or package files.
8. 390px layout has no horizontal page scroll.

## Decision

PASS — one primary operational flow, explicit review before the consequential action, saved audit artifact, and no changes to financial or availability logic.
