# FleetDesk

FleetDesk is a UAE car rental management SaaS for rental managers.

The goal is simple: make daily rental operations faster, clearer, and less manual.

## Core Areas

- Fleet / cars
- Clients
- Contracts
- Payments
- Deposits
- Fines
- Salik
- Reports
- PDF contracts
- Company settings

## Product Priorities

1. Operational speed
2. Simple manager workflow
3. Mobile usability
4. Automation readiness
5. Clean UI consistency
6. Safe scaling for multiple rental companies

## Development Style

This project uses Codex in **Builder Mode**.

Codex should complete requested tasks end-to-end, edit all necessary files, and verify the result. It should not stop at analysis unless analysis is explicitly requested.

Approval is required only for high-risk changes:

- database schema / migrations
- deleting real data
- auth / RLS / permissions
- routing changes
- generated Supabase types
- new dependencies
- broad rewrites of working pages

Normal UI, PDF, workflow, import, and business-logic fixes should be implemented directly.

See `AGENTS.md` for full Codex instructions.
