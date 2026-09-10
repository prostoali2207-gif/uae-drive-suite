create table if not exists public.staff_phone_aliases (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  phone text not null check (length(btrim(phone)) > 0),
  normalized_phone text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_phone_aliases_normalized_phone_key unique (normalized_phone),
  constraint staff_phone_aliases_normalized_phone_format_check check (normalized_phone ~ '^[0-9]{7,15}$')
);

create index if not exists staff_phone_aliases_staff_status_idx
  on public.staff_phone_aliases (staff_id, status);

alter table public.staff_phone_aliases enable row level security;

drop policy if exists "Owners can view own staff phone aliases" on public.staff_phone_aliases;
create policy "Owners can view own staff phone aliases"
  on public.staff_phone_aliases for select to authenticated
  using (exists (
    select 1 from public.staff s
    where s.id = staff_id and s.owner_id = auth.uid()
  ));

drop policy if exists "Owners can insert own staff phone aliases" on public.staff_phone_aliases;
create policy "Owners can insert own staff phone aliases"
  on public.staff_phone_aliases for insert to authenticated
  with check (exists (
    select 1 from public.staff s
    where s.id = staff_id and s.owner_id = auth.uid()
  ));

drop policy if exists "Owners can update own staff phone aliases" on public.staff_phone_aliases;
create policy "Owners can update own staff phone aliases"
  on public.staff_phone_aliases for update to authenticated
  using (exists (
    select 1 from public.staff s
    where s.id = staff_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.staff s
    where s.id = staff_id and s.owner_id = auth.uid()
  ));

drop policy if exists "Owners can delete own staff phone aliases" on public.staff_phone_aliases;
create policy "Owners can delete own staff phone aliases"
  on public.staff_phone_aliases for delete to authenticated
  using (exists (
    select 1 from public.staff s
    where s.id = staff_id and s.owner_id = auth.uid()
  ));

create or replace function public.set_staff_phone_alias_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.normalized_phone := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  if length(new.normalized_phone) < 7 or length(new.normalized_phone) > 15 then
    raise exception 'Invalid staff phone alias';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_staff_phone_alias_fields on public.staff_phone_aliases;
create trigger set_staff_phone_alias_fields
before insert or update on public.staff_phone_aliases
for each row execute function public.set_staff_phone_alias_fields();