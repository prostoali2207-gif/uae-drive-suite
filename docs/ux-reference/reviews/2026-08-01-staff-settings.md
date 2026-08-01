# UX benchmark: staff settings

Date: 2026-08-01
Status: accepted

## Manager job

When a company hires or updates a worker, the manager needs to keep one reliable staff record so the correct person, role, documents and signature are available without mixing workers with system users.

## FleetDesk constraints

- Rental-operations rules: staff records must not alter contracts, money, deposits or vehicle availability.
- Data source of truth: the tenant-owned `staff` table.
- Financial or availability risk: low for staff details; legal/privacy risk for identity and licence data.
- Mobile / RTL constraints: add and edit must work at 390px; phone, ID and licence values remain readable LTR in RTL layouts.

## References reviewed

### Reference 1 — GitHub organization people list

- Comparable job: find a person quickly and inspect their status or role.
- Observed interaction: searchable compact list with status and row-level actions.
- Why it works: fast scanning without opening every record.
- What FleetDesk can reuse: search, visible role/status, one edit action.
- What FleetDesk must reject: permission controls inside the staff record; a staff member is not automatically a FleetDesk user.
- Evidence: documented guidance

### Reference 2 — GOV.UK question pages and validation

- Comparable job: enter personal information safely.
- Observed interaction: short labelled groups, optional fields stated explicitly, validation beside the affected field.
- Why it works: lowers uncertainty and preserves entered values after errors.
- What FleetDesk can reuse: progressive disclosure for driver-only fields and clear required fields.
- What FleetDesk must reject: multi-page flow for this small occasional task.
- Evidence: documented guidance

### Reference 3 — existing FleetDesk settings tabs

- Comparable job: maintain occasional company configuration.
- Observed interaction: settings tabs with a single focused content area.
- Why it works: staff is discoverable without adding another daily navigation item.
- What FleetDesk can reuse: a Staff tab and existing card/dialog components.
- What FleetDesk must reject: placing the entire staff form permanently on the page.
- Evidence: direct observation

## Comparison

- Fastest normal path: Staff tab → Add employee → name and role → Save.
- Safest consequential path: edit an existing record; deactivate instead of deleting it.
- Best bulk / repeated-work pattern: searchable list; no bulk action is needed yet.
- Best exception-handling pattern: preserve dialog values and show the database error.
- Best mobile behavior: stacked employee rows and a viewport-safe scrolling dialog.

## Recommendation

Recommended interaction model: searchable staff list with one Add employee button and one add/edit dialog. Driver-only licence fields appear only for drivers. Existing records are deactivated, never deleted.

Why it fits FleetDesk: this is occasional setup work, keeps daily navigation small, and avoids falsely treating every employee as an authenticated system user.

Patterns explicitly rejected: payroll fields, access-permission controls, destructive delete, wizard, decorative dashboard cards and a desktop-only data table.

## Scenarios to test

1. Add a manager with only required fields, then find and edit the record.
2. Add a driver with licence details and signature; switch the role and confirm hidden driver fields do not block saving.
3. Deactivate a worker and verify the record remains searchable and tenant-isolated.
