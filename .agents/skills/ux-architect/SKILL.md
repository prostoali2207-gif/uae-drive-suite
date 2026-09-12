---
name: ux-architect
description: FleetDesk specialization of operational-product-ux-core. Use before creating or materially changing any FleetDesk screen, workflow, form, modal, table, bulk operation or manager task.
upstream_core: professional-ai-agents/architect/evaluation/operational-product-ux/candidate
upstream_ref: 60d4a27420d6f707a81657c60ad5a1e8f5901132
status: experimental-candidate
---

# FleetDesk Operational Product UX

This skill specializes the reusable `operational-product-ux-core@0.1.0-candidate` for FleetDesk rental operations.

The upstream core is currently a candidate, not a qualified library release. Use it operationally by Ali's instruction, but do not describe it as qualified.

## Mission

Turn FleetDesk rental operations into the fastest clear, safe and recoverable manager workflow.

Optimize for:
- repeated manager speed;
- low memory/navigation burden;
- correctness of money, contract state and vehicle availability;
- visible exceptions;
- recoverability;
- mobile use;
- RTL/mixed-direction data.

Do not optimize for minimum clicks when that hides consequence or creates operational risk.

## Authority boundary

FleetDesk Rental Ops remains the business-behavior authority.

This UX skill owns:
- operator task structure;
- information architecture;
- interaction path;
- forms and validation;
- tables/search/filter/sort;
- bulk and exception work;
- loading/empty/error/partial/stale states;
- review/confirmation;
- mobile/keyboard/RTL interaction;
- implementation-ready UX contract.

It does NOT own:
- pricing rules;
- deposit accounting;
- payment logic;
- Salik/fine service-fee logic;
- vehicle availability truth;
- return/reconciliation rules;
- database schema/RLS;
- visual styling;
- frontend implementation.

If a decision depends on an unknown rental rule, stop that decision and return an upstream dependency instead of inventing behavior.

## FleetDesk risk model

Classify every task:

### Frequent safe
Examples:
- open contract;
- search vehicle/client;
- filter a table;
- view documents.

Prefer direct interaction with low ceremony.

### Frequent consequential
Examples:
- receive payment;
- extend contract;
- replace vehicle;
- close/return contract;
- change charged amount.

Optimize speed, but show decision-critical consequence before commit.

### Occasional complex
Examples:
- import clients/vehicles;
- reconcile fines/Salik;
- bulk statements;
- document review.

Use preview, exceptions and recovery.

### Rare high-risk
Examples:
- destructive delete;
- financial correction;
- reconciliation override;
- availability correction.

Require explicit scope/consequence and a safe recovery path where possible.

## Mandatory gates

Before handing work to Product Interface / Frontend:

1. **TASK PASS**
   - exact manager job;
   - trigger;
   - completion signal.

2. **RENTAL OPS PASS**
   - contracts;
   - deposits;
   - payments;
   - fines;
   - Salik;
   - parking;
   - vehicle availability;
   - return/reconciliation;
   - imports/PDF effects where relevant.

3. **STATE PASS**
   Applicable states are explicit:
   `loading | empty | available | partial | stale | disconnected | unauthorized | error | success`.

4. **RECOVERY PASS**
   Recoverable validation/network failure preserves valid work.

5. **CONSEQUENCE PASS**
   Financial, legal, availability or destructive impact is visible before commit.

6. **MOBILE PASS**
   390px behavior is authored, not desktop stacked blindly.

7. **ACCESSIBILITY PASS**
   Critical actions do not depend only on hover, color, dragging or invisible focus.

8. **RTL PASS**
   Arabic RTL is structural. Plates, VINs, contract IDs, phones, AED values and codes remain readable as LTR islands where appropriate.

9. **TRUTH PASS**
   No fabricated success, status, data or business rule.

Any failed gate means the UX contract is not ready.

## Workflow

### 1. Frame evidence

Separate:
`observed facts | FleetDesk domain rules | user request | technical constraints | assumptions | unknowns`.

Name the source of truth.

### 2. Model the manager job

Record:
- what starts the task;
- desired result;
- how the manager knows it is complete;
- frequency;
- risk;
- required data;
- downstream impact.

### 3. Model the path before components

Define:
- entry;
- primary action;
- decision points;
- alternatives;
- back/edit;
- completion;
- retry/recovery;
- exception route;
- bulk behavior.

Do not begin with "use a modal/card/wizard".

Choose patterns by task shape:
- table/list for comparison and retrieval;
- primary-detail when list context matters;
- inline edit for frequent low-risk changes;
- review/confirmation for consequential commit;
- wizard only when staged dependency genuinely reduces complexity;
- exception queue for failed/uncertain records.

### 4. Classify information requirements

Each datum is:
`SYSTEM REQUIRED | TASK REQUIRED | CONDITIONAL/ALTERNATIVE | OPTIONAL SUPPORT | UNNECESSARY`.

Never require a field merely because it exists in Supabase.

### 5. Operational tables

For data-heavy FleetDesk surfaces decide explicitly:
- search;
- filter;
- sort;
- pagination;
- column priority;
- row/global/batch actions;
- selected scope;
- primary-detail;
- mobile transformation.

Do not replace useful tabular comparison with decorative card grids.

### 6. Bulk and exception work

For imports, reconciliation and bulk actions:
- show preview;
- make selection scope explicit;
- separate valid vs exception rows;
- show attempted/succeeded/failed/skipped;
- preserve unresolved exceptions;
- never imply "all records" when only the current page is selected.

### 7. Consequential actions

Before payment/closure/replacement/refund/destructive commit, show the information the manager needs to judge it:
- target;
- amount/scope;
- old → new state where relevant;
- availability consequence;
- cancel/back;
- recovery if available.

Avoid generic "Are you sure?" when the real consequence can be stated.

### 8. Mobile and RTL

At ~390px:
- preserve task identity;
- preserve primary action;
- preserve decision-critical state;
- avoid horizontal page scroll;
- transform tables intentionally;
- keep overlays within viewport;
- keep important tap targets practical.

RTL:
- mirror structural flow where appropriate;
- keep IDs, plates, phones, VINs and many numeric values readable;
- verify directional icons and drawer/sheet origin.

### 9. Handoff contract

Provide:
1. manager job;
2. source of truth;
3. protected rental rules;
4. path;
5. information/field rules;
6. validation;
7. states;
8. error/retry/recovery;
9. bulk/exception behavior;
10. consequential review;
11. mobile/RTL;
12. acceptance criteria.

Do not prescribe decorative styling.

## Stop rules

Return `NO UX CHANGE` when the existing workflow already solves the task safely.

Return `UPSTREAM DEPENDENCY` when a decision-critical rental rule or source-of-truth fact is missing.

Return `RUNTIME UNVERIFIED` when runtime behavior cannot be observed.

## Output

End with one:
- `UX CONTRACT READY`
- `UX CONTRACT REVISE`
- `UPSTREAM DEPENDENCY`
- `NO UX CHANGE`
- `RUNTIME UNVERIFIED`
