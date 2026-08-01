# FleetDesk Agent Routing

Read the relevant specialist before changing FleetDesk.

## Priority

1. `.agents/skills/fleetdesk-rental-ops/SKILL.md`
   Use first for contracts, vehicles, clients, payments, deposits, fines, Salik, parking, returns, reconciliation, reports, imports, OCR, PDFs, or any change that can affect money or availability.
2. `.agents/skills/ux-benchmark/SKILL.md`
   Use for new modules, major redesigns, imports, reconciliation, data-heavy tables, bulk work, exception queues, or when no proven interaction model is clear. Compare 3–5 relevant patterns and record transferable behavior before final workflow design.
3. `.agents/skills/ux-architect/SKILL.md`
   Use before creating or materially changing a screen, form, modal, or manager workflow. It must classify frequency/risk/complexity, define the manager job, source of truth, happy path, edge cases, bulk/exception behavior, validation, review, completion, recovery, mobile and RTL behavior before coding.
4. `.agents/skills/ui-guard/SKILL.md`
   Use before UI implementation prompts or visual changes.
5. `.agents/skills/frontend-agent/SKILL.md`
   Use after workflow and UI approval to implement React, TypeScript, forms, tables, data fetching, imports, PDF, mobile/RTL and frontend verification.
6. `.agents/skills/supabase-agent/SKILL.md`
   Use for every table, column, migration, RLS, Storage, RPC, schema-cache, database security or Supabase query issue. Verify live project `vlcxjizieelcfunausll`, then keep live database and repository migration identical.
7. `.agents/skills/qa-agent/SKILL.md`
   Use after implementation as the release gate. Test real rental scenarios, tenant isolation, money, availability, imports, PDF, mobile/RTL and connected regressions before publication.

## Working rules

- Solve the requested task completely with the smallest safe change.
- Ali gives standing authorization to commit completed, verified FleetDesk changes, push them to `origin/main`, deploy through Vercel, and apply safe task-required Supabase migrations without asking again.
- Do not pause for confirmation for ordinary code changes, commits, pushes, deployments, tests, or safe reversible database changes. Complete the task and report the result.
- Ask Ali only before deleting data, destructive or irreversible actions, Authentication changes, routing changes, or when a genuinely important product decision cannot be inferred safely.
- Platform-enforced approval prompts cannot be bypassed; do not create additional conversational approval requests when the standing authorization above applies.
- Do not audit or refactor the whole project by default.
- Verify database claims against live Supabase project `vlcxjizieelcfunausll`.
- Protected files are not forbidden; edit only when required and never rewrite them wholesale.
- Do not change unrelated modules, imports, auth, routing, RLS, or public registration.
- Always provide manual verification steps.
- Full implementation order: Rental Ops → UX Benchmark (when needed) → UX Architect → UI Guard → Frontend Agent → Supabase Agent (when database is involved) → QA Agent.
- No database claim without live verification. No publication without a QA PASS; BLOCKED is not PASS.
