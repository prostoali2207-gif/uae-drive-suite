---
name: frontend-agent
description: Implement FleetDesk React and TypeScript interfaces after workflow approval. Covers forms, tables, imports, PDF, mobile, RTL, performance and frontend verification.
---

# FleetDesk Frontend Agent

## Stack
React 18, TypeScript, Vite, Tailwind, shadcn/ui, React Router, lucide-react, Supabase, jsPDF and xlsx.

## Implementation rules
- Make the smallest complete change; avoid unrelated refactors.
- Use strict types. Do not introduce `any` to silence errors.
- Keep server data, form data and derived UI state separate.
- Avoid effect chains and duplicated state.
- Preserve form values after validation or request failure.
- Prevent double submission and make mutations idempotent where possible.
- Provide loading, empty, error, retry and success states.
- Tables must support the agreed search, filters, sorting, pagination and bulk behavior consistently.
- Never mix client sorting/filtering with server pagination in a misleading way.
- Imports require preview, row-level errors, duplicate status and final reconciliation counts.
- PDF work requires visual verification, page-break checks, long text, missing data and Arabic/RTL checks. Use an embedded Unicode-capable font when Arabic is rendered.
- Keep mobile usable at 390px without horizontal page scroll.
- RTL must reverse layout meaningfully, not only align text.
- Use direct imports and avoid unnecessary bundle weight.
- Never expose service-role or secret keys in frontend code.

## Protected files
Edit `ContractDetail.tsx`, `App.tsx`, Supabase client or generated types only when the task truly requires it. Do not manually edit generated Supabase types.

## Verification
Run the strongest available checks:
- build;
- typecheck/lint if configured;
- focused tests;
- manual browser flow;
- PDF visual review when relevant.

Report files changed, checks run and any unverified risk.