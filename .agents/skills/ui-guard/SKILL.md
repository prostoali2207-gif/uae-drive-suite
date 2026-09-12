---
name: ui-guard
description: Independent FleetDesk UI review gate. Use after UX Architecture + Product Interface Design and before frontend implementation or release. Review actual rendered artifacts when available.
status: experimental-reviewer
---

# FleetDesk UI Guard

## Role

Independent reviewer. Do not redesign the product from scratch.

Review the approved:
1. FleetDesk Rental Ops contract;
2. UX contract;
3. Product Interface / Design Systems contract;
4. actual implementation/render when available.

The creator's own self-score is not release evidence.

## Hard blocks

BLOCK when UI:
- hides financial, legal, availability or destructive consequence;
- changes approved workflow/business behavior for visual convenience;
- depends on color alone for critical status;
- makes a core task unusable on mobile;
- fabricates operational status/metrics/proof;
- loses critical state or action;
- creates ambiguous mass-action scope;
- cannot be reviewed because the required runtime/render is unavailable and someone is asking for a visual PASS.

## Review dimensions

### Operational clarity
- current task;
- primary action;
- critical exceptions;
- decision data;
- status visibility.

### System coherence
- one surface hierarchy;
- one semantic color vocabulary;
- consistent typography;
- consistent spacing/radius/border rules;
- shared button/input/table/nav/status behavior;
- no accidental parallel palette.

### Density
- enough data visible for repeated manager work;
- no card explosion;
- no marketing-style empty space;
- no unreadable compression.

### Data surfaces
- search/filter where operationally needed;
- readable plates/IDs/AED/dates;
- clear row/global/batch actions;
- selection scope;
- loading/empty/error states.

### Mobile
At ~390px:
- core task completable;
- primary action reachable;
- no page-level horizontal scroll;
- tables transformed intentionally;
- overlays fit viewport;
- touch targets practical.

### RTL
- structural direction handled;
- mixed LTR values readable;
- icons/drawers/action order sensible.

### Accessibility
- visible focus;
- usable contrast;
- non-color cues;
- meaningful labels;
- no hover-only critical actions.

## Severity

- **P0** — unsafe/false/destructive/financial/availability error, unusable core task, authority/truth violation.
- **P1** — major hierarchy/system/mobile issue that materially slows or confuses daily work.
- **P2** — meaningful consistency/craft weakness.
- **P3** — minor polish.

## Source vs render

Source code can diagnose token/component drift.

Source code alone cannot prove:
- visual hierarchy;
- density;
- actual contrast;
- mobile composition;
- overlay fit;
- rendered consistency.

If render evidence is required but unavailable, return `RENDER BLOCKED`, not PASS.

## Decision

Return one:
- `PASS` — no unresolved P0/P1 and rendered evidence is sufficient where required;
- `REVISE` — exact P1/P2 issues and bounded fixes;
- `BLOCK` — unsafe or upstream workflow/system problem;
- `RENDER BLOCKED` — visual proof unavailable.

Do not issue PASS for substantial UI you personally created unless an independent reviewer has checked it.
