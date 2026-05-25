# FleetDesk — Agent Rules
> Read this file before making ANY changes to the codebase.
> These rules are MANDATORY. Do not skip, override, or ignore them.
> If a task conflicts with these rules — STOP and report it instead of proceeding.

---

## What is FleetDesk

UAE-focused SaaS for car rental management. Built for rental managers, not clients.
Active development — breaking changes have real consequences.
Stack: React + TypeScript + Vite, Tailwind CSS, shadcn/ui, Supabase, Bun.

---

## CRITICAL FILES — NEVER MODIFY OR REWRITE

These files must NEVER be rewritten or significantly modified.
If a task requires touching them — STOP immediately and ask the user.

```
src/pages/ContractDetail.tsx        ← financial ledger, all tabs, Supabase sync. NEVER REWRITE.
src/App.tsx                         ← router. Change only if explicitly instructed.
src/integrations/supabase/client.ts ← DO NOT TOUCH.
src/integrations/supabase/types.ts  ← DO NOT TOUCH.
```

History: ContractDetail.tsx was previously destroyed by an AI rewrite and restored via git.
This must never happen again.

---

## Tech Stack — Never Suggest Alternatives

| Layer | Technology |
|---|---|
| Framework | React + TypeScript + Vite (NOT Next.js) |
| Styling | Tailwind CSS only — no inline styles unless unavoidable |
| UI Components | shadcn/ui |
| Backend / DB | Supabase via src/integrations/supabase/client.ts |
| PDF | jsPDF via src/lib/contractPdf.ts |
| Excel | SheetJS via src/lib/excelImport.ts |
| Icons | lucide-react |
| Fonts | DM Sans (body text), IBM Plex Mono (numbers, AED, IDs, plates) |
| Package manager | Bun |

No new dependencies without explicit user confirmation.

---

## Module Status

| Module | Status | Rule |
|---|---|---|
| Dashboard | ⚠️ Needs redesign | Visual only — do not touch data logic |
| Fleet | ✅ Working | Do not touch |
| Contracts list | ✅ Working | Do not touch |
| Contract Detail | ✅ Working | CRITICAL — never rewrite |
| Clients | ✅ Working | Supabase Storage active |
| Fines & Salik | ✅ Working | Excel import connected |
| Payments | ✅ Working | |
| Reports | ✅ Working | |
| Settings | ✅ Working | |
| PDF Export | ⚠️ Incomplete | jsPDF in contractPdf.ts |
| Tally Webhook | ❌ Dead | server.js — ignore this file |

---

## Supabase Rules

- Always use `src/integrations/supabase/client.ts` — never use direct fetch() to DB
- Storage bucket name: `client-documents`
- File upload path prefix: `client-documents/`
- RLS policies are set manually in Supabase dashboard — do not try to create them in code
- Never remove columns from insert queries without verifying DB schema first
- Column `end_time` does NOT exist in contracts table — never include it in inserts

---

## Coding Rules

- Functional components only — no class components
- TypeScript strictly — no `any` types allowed
- Tailwind for all styling
- shadcn/ui for buttons, dialogs, inputs, dropdowns
- IBM Plex Mono font for all monetary values, IDs, license plates
- DM Sans font for all body text

---

## Development Rules — MANDATORY

### Rule 1 — One task, one file
Modify maximum 2 files per task.
If more are needed — stop and ask the user to split the task.

### Rule 2 — Never rewrite, only modify
Never rewrite entire files.
Make targeted edits only: find the specific section, change only that.

### Rule 3 — Style changes must not touch logic
If the task is visual (colors, spacing, layout):
- Do NOT change function names
- Do NOT change data fetching logic
- Do NOT change component props or state
- Only change JSX structure and Tailwind classes

### Rule 4 — New features go in new files
When adding UI that might conflict with existing logic:
- Create a NEW component file
- Do NOT inject into existing working pages
- Connect only after user confirms it works

### Rule 5 — Never update the router without confirmation
Do not update App.tsx or add routes until explicitly told to do so.

### Rule 6 — Always report what changed
After every task, output:
- Which files were modified
- What exactly was changed (line-level, not a summary)
- What was NOT changed

### Rule 7 — Stop on uncertainty
If a task requires changing ContractDetail.tsx, App.tsx, or any Supabase integration file:
STOP. Report the conflict. Ask the user before proceeding.

---

## Git Workflow

Always commit after a completed working task:
```
git add . && git commit -m "description of what changed"
```

Before any risky change:
```
git add . && git commit -m "wip: before [task name]"
```

To restore a file if something breaks:
```
git restore src/pages/FileName.tsx
# or from previous commit:
git show HEAD~1:src/pages/FileName.tsx > src/pages/FileName.tsx
```

Repository: github.com/prostoali2207-gif/uae-drive-suite
Branch: main

---

## UAE Rental Context

Always think in operations, not pages:
Lead → Client → Contract → Deposit → Vehicle Delivery → Salik → Fines → Return → Reconciliation → Payment Closure → Reports

- Salik = UAE road toll system, auto-charged, tracked per transaction
- Fines = TAMM traffic violations + 20 AED service fee per fine
- Deposits are SEPARATE from payments — never mix in UI or data
- All amounts in AED, displayed in IBM Plex Mono font
- Arabic + English required in PDF output and contract terms
- WhatsApp is the primary communication channel, not email
