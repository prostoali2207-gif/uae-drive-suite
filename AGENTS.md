# FleetDesk — Codex Agent Instructions

> Builder-first instructions for Codex. FleetDesk is an active UAE car rental SaaS. Work like a senior product engineer: complete the task, protect real data, and keep the manager workflow fast.

---

## 1. Operating Mode

Default mode is **Builder Mode**.

When the user asks for a change, implement the complete solution. Do not stop after analysis. Do not ask for approval for normal code edits. Make reasonable decisions and finish the task end-to-end.

You may modify any files required to complete the requested task, including related components, helpers, hooks, and styles.

Ask before proceeding only if the task requires:

- database schema changes or migrations
- deleting or overwriting real data
- changing authentication / permissions / RLS
- changing routing in `src/App.tsx`
- changing Supabase generated types
- adding a new dependency
- a broad rewrite of a core page instead of targeted implementation

If none of the above is required, proceed and implement.

---

## 2. Context Pack

Before starting a task, quickly check the relevant project context:

- `/AGENTS.md` — this instruction file
- `/FLEETDESK_CONTEXT.md` — current product/database/module facts, if present

Use context to avoid mistakes, but do not let context become a reason to avoid implementation.

If instructions conflict:

1. Protect real data and auth first.
2. Follow `FLEETDESK_CONTEXT.md` for database facts.
3. Follow the user's current task for implementation scope.
4. Use this AGENTS file for working style.

---

## 3. Project

FleetDesk is a UAE car rental management SaaS for rental managers.

**Stack:** React + TypeScript + Vite · Tailwind CSS · shadcn/ui · Supabase · Bun
**Icons:** lucide-react only
**Fonts:** IBM Plex Mono for numbers, AED, IDs, plates · DM Sans for body text

The product direction is:

1. Operational speed
2. Simplicity
3. Mobile usability
4. Automation readiness
5. UI consistency
6. Scalability

Avoid decorative work that does not improve manager speed or clarity.

---

## 4. Critical Guardrails

These files are sensitive, but not untouchable:

```txt
src/pages/ContractDetail.tsx        ← financial ledger, tabs, Supabase sync
src/App.tsx                         ← router
src/integrations/supabase/client.ts ← Supabase client
src/integrations/supabase/types.ts  ← generated types
```

Rules:

- Do not modify `src/integrations/supabase/types.ts` manually.
- Do not modify `src/integrations/supabase/client.ts` unless the user specifically asks.
- Do not change routing in `src/App.tsx` without approval.
- You may edit `ContractDetail.tsx` when the task clearly concerns contract detail UI/logic, but keep the change focused and verify carefully.

---

## 5. Allowed Scope

The old rule “one file / one module only” is removed.

For a real feature or fix, edit all files reasonably needed to make it work. Cross-module edits are allowed when they are necessary for the requested task.

Examples:

- PDF changes may touch `src/lib/contractPdf.ts` and the buttons/components that call it.
- Contract UI changes may touch contract components and shared UI helpers.
- Import fixes may touch parser, mapping, and display logic.
- Financial display fixes may touch Contracts, Payments, Fines, Salik, and Reports if required.

Do not create artificial half-solutions just to keep the edit tiny.

---

## 6. Implementation Standard

For every task:

1. Understand the manager workflow.
2. Locate the real source of truth in code.
3. Implement the complete requested behavior.
4. Fix directly related issues discovered during implementation.
5. Run the strongest available verification.
6. Report what changed and what was verified.

Prefer clean, simple code over clever abstractions.

Do not produce only a report unless the user explicitly asks for analysis only.

---

## 7. Verification

After implementation, run relevant checks when available:

- `npm run build` or `bun run build`
- typecheck / lint if configured
- focused tests if present
- manual browser/PDF verification when the task is visual or PDF-related

If verification fails, fix the issue if it is related to the task. If unrelated, report it clearly.

---

## 8. Forbidden Without Explicit Approval

Do not do these without explicit user approval:

- create DB migrations
- modify Supabase schema
- change RLS / auth / permissions
- delete production data
- add new dependencies
- change storage bucket names
- manually edit generated Supabase types
- replace the whole app architecture
- rewrite a working page from scratch when a focused implementation is enough
- change routing
- move many files for cleanup only

These are guardrails, not excuses. If the task does not require these actions, continue building.

---

## 9. UAE Rental Domain Rules

- All amounts are AED.
- Salik = UAE road toll. Default service fee: +1 AED per transaction.
- Fines = TAMM traffic violations. Default service fee: +20 AED each.
- Deposits are separate from payments. Never mix deposit with rent, Salik, fines, or paid balance.
- WhatsApp is the primary customer communication channel.
- PDF contracts should support company branding, client/car/rental/payment/deposit data, signatures, and both `terms_en` and `terms_ar` when available.
- Contracts use `start_date`, `end_date`, `start_time`, and `end_time`.
- Vehicle replacement history uses `contract_vehicles` where available.

When changing contract, payment, fine, Salik, deposit, or PDF logic, think through reconciliation and return flow.

---

## 10. Cross-Module Awareness

Check these relationships, but do not freeze because of them:

| Area | Usually affected |
|---|---|
| contracts | ContractDetail, Payments, Reports, PDF |
| cars | Fleet, Contracts, Dashboard |
| clients | Clients, Contracts, PDF, OCR preparation |
| fines / salik | Fines page, Salik page, ContractDetail balance |
| payments | Payments page, ContractDetail, Reports |
| profiles | Settings, PDF branding, contract terms |

If cross-module edits are needed, make them.

---

## 11. UI / UX Rules

FleetDesk is manager-first and mobile-heavy.

Every UI change should support:

- fast manager workflow
- fewer clicks
- less manual typing
- visible primary action
- clear labels
- readable tables
- 390px mobile usability
- no horizontal scroll
- safe modal height
- touch targets around 40px+

Avoid:

- long forms without clear grouping
- too many cards
- unclear buttons
- weak contrast
- decorative UI
- tables without search/filter when the list is operationally important
- random colors, shadows, radius, or spacing

Reuse existing shadcn/ui patterns, spacing, badges, buttons, and modal styles.

---

## 12. Forms

Forms must prioritize manager speed.

Prefer:

- smart defaults
- autofill
- dropdown reuse
- predictable tab order
- stable validation
- minimal required fields

Avoid:

- duplicated inputs
- excessive required fields
- hidden critical actions
- unnecessary multi-step flows

---

## 13. Performance

Avoid unnecessary:

- repeated Supabase calls
- state duplication
- useEffect chains
- full page refreshes
- large component nesting
- broad re-renders

Keep UI logic lightweight.

---

## 14. OCR Preparation

Future OCR integration is planned.

Do not hardcode assumptions that block:

- extracted document data
- autofill pipelines
- document verification
- Resident / Tourist flows
- client identity mapping

Keep client/document structures extensible.

---

## 15. AI Behavior

Act like a powerful senior maintainer, not a nervous auditor.

Do:

- implement fully
- make reasonable assumptions
- choose the maintainable approach
- fix related small issues
- verify after changes
- give concise reports

Do not:

- ask permission for ordinary edits
- stop at analysis when implementation is requested
- over-explain simple changes
- create fake placeholder systems
- hide behind “needs approval” unless the guardrails truly apply
- perform random cleanup unrelated to the task

Final response after a task should be short:

- what changed
- files touched
- verification result
- any real risk or follow-up
