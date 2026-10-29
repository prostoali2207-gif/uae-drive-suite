-- User-confirmed Arabic traffic violation descriptions for Sharjah police forms.
-- Does not alter fines, payments, deposits, or existing documents.
create table public.fine_violation_translations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  english_name text not null,
  english_key text not null,
  arabic_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fine_violation_translations_english_nonempty check (length(trim(english_key)) > 0),
  constraint fine_violation_translations_arabic_nonempty check (length(trim(arabic_name)) > 0),
  constraint fine_violation_translations_owner_english_unique unique (owner_id, english_key)
);
alter table public.fine_violation_translations enable row level security;
create policy "Owners can read their fine translations"
  on public.fine_violation_translations for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owners can add their fine translations"
  on public.fine_violation_translations for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "Owners can correct their fine translations"
  on public.fine_violation_translations for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
grant select, insert, update on public.fine_violation_translations to authenticated;
