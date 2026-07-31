---
name: fleetdesk-rental-ops
description: Main FleetDesk domain skill. Use first for any feature or fix touching rental operations, contracts, vehicles, clients, payments, deposits, fines, Salik, parking, imports, returns, reconciliation, reports or PDFs.
---

# FleetDesk Rental Operations

## Goal
Protect rental correctness before UI or code decisions. Optimize for manager speed without breaking money, availability or reconciliation.

## Mandatory checks
For every relevant task determine:
- contract state and source of truth;
- vehicle availability and date/time overlap;
- rental price, extensions and replacement segments;
- payments versus outstanding balance;
- deposit as a separate ledger;
- fines, Salik and parking ownership and service fees;
- return, closure and reconciliation effects;
- PDF and reports affected;
- tenant isolation and auditability.

## Core rules
- Amounts are AED.
- Deposits never count as rent payments.
- Salik default service fee is +1 AED per transaction unless company settings say otherwise.
- Fine default service fee is +20 AED unless company settings say otherwise.
- Never allow overlapping vehicle allocation.
- Vehicle replacement pricing must respect segment boundaries and the values entered for that replacement.
- A closed contract must still reconcile later fines, Salik and deposit actions safely.
- Imports require preview, duplicate handling, invalid-row reporting and an explicit final count.
- Do not infer database facts. Hand database questions to Supabase Agent.

## Output before implementation
State briefly:
1. manager job;
2. operational source of truth;
3. affected ledgers/modules;
4. risky edge cases;
5. acceptance conditions.

Keep scope limited to the requested operation. Do not redesign unrelated rental logic.