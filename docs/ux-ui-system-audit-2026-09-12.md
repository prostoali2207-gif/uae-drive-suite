# FleetDesk UX/UI system audit — 2026-09-12

Status: first operational use of the experimental professional UX/UI cores.

Upstream:
- Operational Product UX / Interaction Design Core 0.1.0-candidate
- Product Interface / Design Systems Core 0.1.0-candidate
- professional-ai-agents ref: 60d4a27420d6f707a81657c60ad5a1e8f5901132

Qualification was intentionally skipped by Ali for now. These cores are in operational use as experimental candidates.

## Scope

Bounded review:
- Dashboard
- Contracts
- Contract Detail
- Fleet
- Clients
- shared FleetDesk design tokens

No business/domain audit. No routing/auth/database changes.

## Rental Ops boundary

Protected:
- contract state
- deposits
- payments
- fines
- Salik
- parking
- vehicle availability
- return/reconciliation
- imports
- PDFs
- tenant/business rules

Visual/system work must not change these behaviors.

## UX diagnosis

The five primary manager areas already use appropriate operational patterns:
- tables/lists where comparison matters;
- search/filter in operational lists;
- direct navigation;
- responsive-specific handling exists in several places;
- monetary/ID values frequently use mono/tabular treatment.

The highest-value problem is not a missing new workflow. It is cross-screen interface-system drift.

UX verdict for this pass: NO UX CHANGE.

## Product Interface diagnosis

### P1 — parallel dark surface systems

The main theme defines semantic tokens in `src/index.css`, including:
- background
- card
- secondary/muted
- border/input
- primary
- fd-* roles

But several operational surfaces bypass them with raw palettes:
- `#12121a`
- `#11131b`
- `#161925`
- `#161d35`
- `#161b27`
- `#0f1117`
- `#191b20`
- `#22222e`
- `#232d4a`
- `#252d3d`

Effect: sibling screens/sheets feel like related but different products.

### P1 — semantic-state drift

Paid / partial / unpaid and selected states are often expressed with raw greens/ambers/reds/blues even though FleetDesk already exposes semantic tint and primary tokens.

Effect:
- repeated raw values;
- harder cross-screen consistency;
- future theme changes require many local edits.

### P1 — Contract Detail ecosystem is the clearest visual silo

Contract Detail and its Fines/Salik/Parking sheets contain a concentrated parallel palette:
- custom sheet surface;
- custom borders;
- custom selected state;
- custom primary blue;
- custom status colors.

This is a good first SYSTEMIZE target because it is high-use and visually connected.

### P2 — Clients mobile surface has local card styling

Clients mobile summary uses local hard-coded dark surfaces instead of the shared card/border vocabulary.

Defer until Contract Detail batch is stable.

### P2 — New Contract is intentionally a separate light/cyan visual world

`NewContract.tsx` uses a light background and cyan shell.

Do not normalize it blindly. It is a large task workflow and needs a separate UX + interface decision before changing it.

### P2 — secondary sheets/modals have several parallel palettes

Vehicle history/timeline, fines detail, Salik detail, parking detail and signature flows each contain local surface values.

Migrate incrementally by workflow family rather than global search-and-replace.

## Canonical direction

Use existing FleetDesk semantic roles first:
- `bg-background`
- `bg-card`
- `bg-muted`
- `border-border`
- `text-foreground`
- `text-muted-foreground`
- `bg-primary`
- `text-primary-foreground`
- `ring-ring`
- tint semantic roles for success/warning/error

Only add a new token when no current role represents the required meaning.

## First bounded implementation batch

Contract Detail family only:
- ContractDetail selected states
- ContractDetail action buttons/statuses
- Fines sheet shell/statuses
- Salik sheet shell/statuses
- Parking bulk sheet shell/selection

Explicitly unchanged:
- data queries
- calculations
- contract/payment logic
- action behavior
- table contents
- routing
- Supabase
- rental rules

## Acceptance conditions

- no new raw palette introduced;
- primary action uses shared primary role;
- paid/partial/unpaid use shared semantic tint roles;
- sheet shell uses shared card/border/text roles;
- selected state uses shared primary role;
- all existing actions and business behavior remain unchanged.

Product Interface verdict: SYSTEMIZE READY.


## First batch implementation status

Implemented on branch `ui/operational-product-cores`:

- upgraded FleetDesk UX specialization to the Operational Product UX core;
- added FleetDesk Product Interface / Design Systems specialization;
- upgraded UI Guard into an independent reviewer;
- updated FleetDesk agent routing;
- migrated Contract Detail visual states/surfaces toward shared semantic tokens;
- migrated Fines/Salik/Parking working sheets used from Contract Detail toward shared semantic tokens.

Files with product UI changes:
- `src/pages/ContractDetail.tsx`
- `src/components/FinesModal.tsx`
- `src/components/SalikModal.tsx`
- `src/components/ParkingBulkSheet.tsx`

No intended change to:
- queries;
- mutations;
- calculations;
- rental rules;
- routing;
- Supabase;
- action handlers.

Next systemization targets after this batch:
1. Clients mobile summary surfaces;
2. fines/Salik/parking detail bottom sheets;
3. vehicle history/timeline sheets;
4. New Contract only as a separate UX/interface task.


## Second systemization batch — mobile + desktop

Applied after Ali explicitly required parity across mobile and desktop.

Affected:
- `src/pages/Clients.tsx`
- `src/components/FinesDetailModal.tsx`
- `src/components/SalikDetailModal.tsx`
- `src/components/ParkingDetailModal.tsx`
- `src/components/VehicleHistorySheet.tsx`
- `src/components/VehicleTimelineSheet.tsx`
- `src/components/VehicleTimelineEditPanel.tsx`

### Mobile requirements

- ~390px remains a first-class viewport.
- Clients keeps dedicated mobile cards and filters, but uses the same semantic surfaces/status colors as desktop.
- Fines summary changes from 4 cramped columns to 2×2 on mobile and returns to 4 columns on `sm+`.
- Fines detail rows collapse to a mobile two-column priority layout; date moves under the violation identifier and status remains visible below the amount.
- Salik summary changes to 2×2 on mobile and 4 columns on `sm+`.
- Vehicle History/Timeline remain full-width sheets on mobile.
- Touch controls remain at least the existing ~44px treatment.
- No page-level horizontal scroll was introduced by this batch.

### Desktop requirements

- Existing desktop tables/list structure remains unchanged unless a semantic-token replacement is required.
- Fines desktop retains its four-column data layout.
- Vehicle History/Timeline retain their existing `sm:max-w` side-sheet widths.
- Clients desktop table remains the primary desktop representation.
- Semantic status/surface roles are shared with mobile.

### Behavior boundary

No intended changes to:
- Supabase queries/mutations;
- rental calculations;
- payments/deposits;
- vehicle availability;
- replacement logic;
- client validation;
- routing/authentication.

This batch changes visual tokens and responsive presentation only.
