-- Showroom driver advances, expenses and settlements. Rental ledger is untouched.
-- Entries are written only by the Telegram Edge Function using service_role.
create table if not exists public.showroom_driver_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  driver_staff_id uuid not null references public.staff(id),
  actor_staff_id uuid not null references public.staff(id),
  kind text not null check (kind in ('advance','expense','return','reimbursement')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','applied','failed')),
  sheet_sync_status text not null default 'pending' check (sheet_sync_status in ('pending','synced','failed')),
  event_key text not null,
  finance_audit_id uuid references public.telegram_operation_requests(id),
  article text,
  vehicle text,
  note text,
  receipt_path text,
  sheet_row integer,
  error_message text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (owner_id, event_key),
  unique (finance_audit_id),
  constraint showroom_driver_event_key_length check (length(event_key) between 8 and 200),
  constraint showroom_driver_note_length check (note is null or length(note) <= 500),
  constraint showroom_driver_vehicle_length check (vehicle is null or length(vehicle) <= 160),
  constraint showroom_driver_expense_audit check (kind <> 'expense' or finance_audit_id is not null)
);
create index if not exists showroom_driver_movements_staff_created_idx
  on public.showroom_driver_movements (owner_id, driver_staff_id, created_at desc);
create index if not exists showroom_driver_movements_pending_sync_idx
  on public.showroom_driver_movements (sheet_sync_status, created_at)
  where sheet_sync_status <> 'synced';
alter table public.showroom_driver_movements enable row level security;
revoke all on table public.showroom_driver_movements from anon, authenticated;
grant all on table public.showroom_driver_movements to service_role;
comment on table public.showroom_driver_movements is
  'Showroom driver petty-cash ledger, separate from Rental. Cash advances and returns do not affect main cash ledger.';
