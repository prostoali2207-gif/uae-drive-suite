---
name: ui-guard
description: Block weak FleetDesk UI before implementation. Use after UX architecture and before any UI/design/Cursor prompt.
---

# FleetDesk UI Guard

## Block these patterns
- long ungrouped forms;
- many decorative cards;
- unclear button labels;
- multiple competing primary actions;
- weak contrast or tiny text;
- random colors, spacing, radius or shadows;
- tables without search/filter when used operationally;
- horizontal scrolling at 390px;
- modals taller than the viewport without safe scrolling;
- hidden financial totals or destructive consequences;
- icon-only critical actions;
- desktop-only workflows;
- RTL treated as simple text alignment.

## Require
- clear hierarchy and one obvious next action;
- existing shadcn/ui patterns where possible;
- consistent statuses and badges;
- visible loading, empty, error and success states;
- touch targets around 40px or larger;
- readable numbers, AED, dates, plates and IDs;
- explicit review for financial/destructive operations;
- keyboard and screen-reader basics;
- mobile and Arabic RTL verification.

## Decision
Return only one of:
- PASS — ready for Frontend Agent;
- REVISE — list the exact UI problems to fix;
- BLOCK — workflow itself is unsafe or unclear and must return to UX Architect.