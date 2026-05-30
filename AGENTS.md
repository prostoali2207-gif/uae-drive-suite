# FleetDesk — Codex Agent Instructions

> Read this file before making ANY changes. These rules are mandatory.

---

## Context Pack

Before starting any task, read:
- `/AGENTS.md` — rules and forbidden actions
- `/FLEETDESK_CONTEXT.md` — DB schema, module status, known bugs

If instructions conflict: `FLEETDESK_CONTEXT.md` has higher priority on DB schema facts.
Never modify more than one module per task. Cross-module edits require explicit approval.

---

## Project

UAE car rental management SaaS. Built for rental managers, not clients.
Active development — breaking changes have real consequences.

**Stack:** React + TypeScript + Vite · Tailwind CSS · shadcn/ui · Supabase · Bun
**Icons:** lucide-react only
**Fonts:** IBM Plex Mono (all numbers, AED, IDs, plates) · DM Sans (body text)
**No new dependencies** without explicit instruction.

---

## Critical Files — NEVER rewrite or modify without explicit instruction

```
src/pages/ContractDetail.tsx        ← financial ledger, all tabs, Supabase sync
src/App.tsx                         ← router, do not change routing
src/integrations/supabase/client.ts ← Supabase client, do not touch
src/integrations/supabase/types.ts  ← generated types, do not touch
```

If a task requires touching any of these → **stop and ask before proceeding**.

---

## Supabase Schema (current)

| Table | Key columns |
|---|---|
| `profiles` | id, company_name, logo_url, phone_number, terms_en, terms_ar |
| `cars` | id, plate, make, model, year, status, insurance_expiry, mulkiya_expiry, tag_number |
| `clients` | id, full_name, phone, client_type, emirates_id, passport_number, nationality, license_number, date_of_birth, rental_type, is_new, document URLs |
| `contracts` | id, client_id, car_id, start_date, end_date, start_time, end_time, rate_type, rate_amount, total_amount, deposit_amount, status, payment_status, client_signature, manager_signature |
| `fines` | id, car_id, client_id, contract_id, fine_date, amount, original_amount, service_fee, status |
| `salik` | id, car_id, client_id, contract_id, charge_date, trips, transaction_id, tag_number, amount, service_fee, status |
| `payments` | id, contract_id, client_id, amount, payment_date, method, status |
| `contract_vehicles` | id, contract_id, car_id, started_at, ended_at |

**Always use** `src/integrations/supabase/client.ts` — no direct fetch() to DB.
**Storage bucket:** `client-documents` (passport, EID, license uploads)

---

## Coding Rules

1. **One file, one task.** Never modify more than 2 files per task.
2. **No rewrites.** Targeted edits only — find the section, change only that.
3. **Style changes = zero logic changes.** If task is visual: only JSX + Tailwind. No function names, no props, no data fetching.
4. **New features = new files.** Create a new component, don't inject into working pages.
5. **Never connect to App.tsx** until explicitly told to do so.
6. **After every task:** list exactly which files and sections were modified, and what was not touched.

---

## UAE Domain Rules

- All amounts in **AED** · IBM Plex Mono font
- **Salik** = UAE road toll, charged per transaction, +1 AED service fee
- **Fines** = TAMM traffic violations, +20 AED service fee each
- **Deposits** are separate from payments — never mix in UI or data
- **WhatsApp** is primary communication channel, not email
- PDF contracts require both `terms_en` and `terms_ar`
- Contracts track `start_time` and `end_time` (both exist in DB, nullable)

---

## Cross-Module Impact — check before every change

| Area | Modules affected |
|---|---|
| `contracts` table | ContractDetail, Payments, Reports |
| `cars` table | Fleet, Contracts, Dashboard |
| `clients` table | Clients, Contracts, PDF |
| `fines` / `salik` | Fines page, ContractDetail balance tab |
| `payments` | Payments page, ContractDetail, Reports |
| `profiles` | Settings, PDF branding, contract terms |

---

## Known Issues (do not attempt to fix unless tasked)

- PDF export (`src/lib/contractPdf.ts`) — incomplete, in progress
- Dashboard (`src/pages/Dashboard.tsx`) — needs redesign, data is connected
- `server.js` — dead code, Tally webhook abandoned

---

## Forbidden Actions

The agent MUST NOT:

- create DB migrations
- modify Supabase schema
- rename hooks/functions/types
- replace working components
- introduce global state libraries
- add new dependencies
- rewrite pages from scratch
- move files without instruction
- delete code unless explicitly requested
- change routing
- change auth flow
- change storage bucket names
- modify generated Supabase types
- perform broad refactors

If a task appears to require one of these:
STOP and explain why before proceeding.

---

## Before Any Change

Before modifying code:

1. Identify affected modules
2. Check cross-module impact
3. Explain minimal change strategy
4. Avoid touching unrelated logic
5. Prefer isolated edits
6. Preserve working flows
7. If risk is medium/high → ask first

Always think like a maintainer of a live operational system.

---

## Safe Editing Strategy

Preferred order:

1. Analyze
2. Locate exact section
3. Apply smallest possible edit
4. Verify no logic regression
5. Report modified files

Avoid "cleanup refactors" unless explicitly requested.

---

## Mobile-First Rules

FleetDesk is manager-first and mobile-heavy.

Every UI change must be checked for:

- 390px width usability
- no horizontal scroll
- safe modal height
- visible primary actions
- proper keyboard behavior on mobile
- minimum touch target size ~40px
- readable tables on mobile
- stable spacing inside dialogs

Never optimize desktop at the expense of mobile workflows.

---

## UI Consistency Rules

Maintain visual consistency across the system.

Always reuse existing:

- spacing scale
- card styles
- badge variants
- modal patterns
- table styles
- typography hierarchy
- button sizes
- colors

Avoid:

- random colors
- custom shadows
- inconsistent radius
- oversized paddings
- multiple visual styles in same module

Prefer existing shadcn/ui patterns already used in project.

---

## Form Rules

Forms must prioritize manager speed.

Prefer:

- autofill
- dropdown reuse
- smart defaults
- minimal typing
- stable validation
- predictable tab order

Avoid:

- excessive required fields
- duplicated inputs
- hidden critical actions
- multi-step flows unless necessary

---

## Performance Rules

Avoid unnecessary:

- re-renders
- useEffect chains
- state duplication
- large component nesting
- repeated Supabase calls
- full-page refresh logic

Prefer lightweight UI logic.

---

## AI Behavior Rules

Do not behave like a tutorial generator.

Do not:

- over-explain simple edits
- rewrite entire files
- introduce architecture changes unnecessarily
- generate placeholder systems
- create fake abstractions

Act like a senior maintainer working inside an active production SaaS.

---

## OCR Preparation Rules

Future OCR integration is planned.

Do not hardcode assumptions preventing:

- extracted document data
- autofill pipelines
- document verification
- client identity mapping

Keep client/document structures extensible.

---

## Current Product Direction

Priority order:

1. Operational speed
2. Simplicity
3. Mobile usability
4. Automation readiness
5. UI consistency
6. Scalability

Not priority:

- fancy animations
- over-engineering
- enterprise abstractions
- micro-optimizations
- trendy architecture changes

Optimize for real rental managers in UAE operations.
