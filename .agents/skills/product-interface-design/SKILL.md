---
name: product-interface-design
description: FleetDesk specialization of product-interface-design-systems-core. Use after UX architecture and before frontend implementation for visual hierarchy, density, typography, semantic color, surfaces, tokens, components, tables, forms, navigation, responsive and RTL craft.
upstream_core: professional-ai-agents/architect/evaluation/product-interface-design/candidate
upstream_ref: 60d4a27420d6f707a81657c60ad5a1e8f5901132
status: experimental-candidate
---

# FleetDesk Product Interface / Design Systems

This skill specializes the reusable `product-interface-design-systems-core@0.1.0-candidate` for FleetDesk.

The upstream core is currently a candidate, not a qualified library release. Ali explicitly chose to use it before formal qualification.

## Mission

Turn an approved FleetDesk UX contract into one coherent operational interface system.

Priorities:
1. task clarity;
2. scanability;
3. consistent state;
4. appropriate information density;
5. manager speed;
6. accessibility;
7. visual quality.

Do not optimize for spectacle.

## Boundary

Own:
- visual hierarchy;
- density;
- typography;
- semantic color/state;
- spacing/rhythm;
- surfaces/borders/elevation;
- tokens;
- component visual consistency;
- tables/forms/navigation/statuses;
- responsive and RTL visual transformation;
- system drift diagnosis.

Do not change:
- rental business rules;
- field requirements;
- workflow steps;
- action semantics;
- money logic;
- availability logic;
- Supabase behavior.

If a visual fix requires UX/business change, return `UPSTREAM UX CONSTRAINT`.

## FleetDesk visual principles

- Dense operational UI is allowed when it improves comparison and repeated work.
- Avoid marketing-page spacing inside daily manager tools.
- Cards are grouping tools, not the default container for every fact.
- One primary action should dominate a local decision context.
- Semantic colors are for meaning, not decoration.
- Money, AED values, plates, dates, IDs and codes must remain highly scannable.
- DM Sans is the primary UI family.
- IBM Plex Mono is appropriate for numeric/data identifiers when alignment or character distinction matters.
- Familiar controls are preferred over novelty when they reduce hesitation.

## Non-negotiable gates

1. **CONTRACT PASS**
   Approved UX/rental behavior remains intact.

2. **HIERARCHY PASS**
   Current task, critical exception, decision data and primary action are visually clear.

3. **SYSTEM PASS**
   Typography, color, spacing, surfaces and components form one coherent system.

4. **STATE PASS**
   Success/warning/error/info/selected/focus/disabled/loading roles are stable across screens and do not depend only on hue.

5. **DENSITY PASS**
   Repeated manager work is not made slower by oversized cards, headings or whitespace.

6. **RESPONSIVE PASS**
   Narrow UI is structurally transformed instead of compressed or blindly stacked.

7. **ACCESSIBILITY PASS**
   Contrast, focus, touch targets and non-color cues remain viable.

8. **RTL PASS**
   Arabic layout and mixed LTR operational values remain readable.

9. **TRUTH PASS**
   No invented status, metrics or operational proof.

## SYSTEMIZE mode

Use SYSTEMIZE when several FleetDesk screens have parallel palettes/components.

Before changing individual screens:
1. identify repeated visual roles;
2. map current variants;
3. define canonical role/token;
4. distinguish legitimate exception from drift;
5. repair the shared system first when practical;
6. migrate only the affected screens;
7. do not redesign unrelated workflows.

## Canonical visual roles

FleetDesk should have one role for each of these concepts:

### Surfaces
- page background;
- navigation/sidebar;
- primary work surface;
- secondary/raised surface;
- control/input surface;
- overlay/sheet/dialog;
- selected/active surface.

### Text
- primary;
- secondary;
- muted;
- disabled;
- inverse.

### Interaction
- primary action;
- hover;
- focus;
- selected;
- disabled.

### Semantic states
- success / available / paid;
- warning / partial / needs review;
- error / destructive / unpaid;
- info;
- neutral / unknown.

Do not create new raw colors when an existing semantic role already fits.

## Typography

Use a compact role system:
- page title;
- section title;
- body;
- control label;
- helper/error;
- metadata;
- status;
- numeric value;
- ID/code/plate.

Avoid:
- multiple font families for decoration;
- oversized display type in dense screens;
- tiny critical metadata;
- inconsistent numeric alignment.

## Density and spacing

Use spacing according to relationship:
- items in one concept: tight;
- sibling groups: medium;
- major sections: strongest separation.

Repeated rows and tables should have stable rhythm.

Flag:
- card-per-field;
- random padding;
- random radius;
- random shadows;
- excessive vertical whitespace;
- many one-off surface colors.

## Tables and lists

Preserve comparison.

Prioritize:
- primary identifier;
- decision columns;
- numeric alignment;
- readable statuses;
- restrained row actions;
- clear selection mode;
- search/filter visibility;
- empty/loading/error state.

On mobile, choose priority columns + detail/list transformation before horizontal page scroll.

## Forms

Group by manager task, not database schema.

Visually distinguish:
- label;
- control;
- helper;
- error;
- required/optional;
- section;
- review;
- primary/secondary/destructive action.

Do not use red border alone as an error.

## Navigation

Make current location obvious without competing with the page primary action.

Sidebar/tabs/subnav should use one consistent active/current vocabulary.

## Overlays

Use:
- popover for lightweight contextual choice;
- dialog for focused decision;
- sheet for supporting detail while preserving context;
- full page for complex/high-risk workflow.

Keep close/cancel reachable and viewport-safe.

## Responsive / RTL

At mobile width:
- preserve task hierarchy;
- keep primary action reachable;
- avoid page-level horizontal scroll;
- adapt tables;
- ensure overlays fit viewport.

RTL:
- mirror meaningful structural direction;
- preserve LTR islands: contract IDs, plates, VINs, phones, codes, many numeric values;
- verify icons and drawer/sheet direction.

## Output

### DIRECT
1. visual diagnosis;
2. protected UX constraints;
3. hierarchy/density;
4. visual system;
5. component/state rules;
6. responsive/RTL;
7. implementation contract.

### SYSTEMIZE
1. observed drift;
2. root causes;
3. canonical tokens/components;
4. bounded consolidation plan;
5. affected screens;
6. unchanged screens/behavior;
7. acceptance criteria.

End with:
- `INTERFACE CONTRACT READY`
- `INTERFACE CONTRACT REVISE`
- `SYSTEMIZE READY`
- `UPSTREAM UX CONSTRAINT`
- `NO VISUAL SYSTEM CHANGE`
- `RENDER BLOCKED`
