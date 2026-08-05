-- Automatically create an active client when the public registration form is submitted.
-- The request row is retained as an accepted audit record.

create or replace function public.auto_accept_client_registration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_client_id uuid;
begin
  if new.status <> 'pending'
     or new.reviewed_by is not null
     or new.reviewed_at is not null
     or new.rejection_reason is not null
     or new.created_client_id is not null then
    raise exception 'Invalid public client registration state';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = new.owner_id
  ) then
    raise exception 'Invalid registration owner';
  end if;

  insert into public.clients (
    owner_id,
    full_name,
    phone,
    client_type,
    emirates_id,
    emirates_id_expiry,
    passport_number,
    passport_expiry,
    nationality,
    email,
    license_number,
    license_expiry,
    date_of_birth,
    passport_photo_url,
    eid_front_url,
    eid_back_url,
    license_front_url,
    license_back_url,
    is_new
  ) values (
    new.owner_id,
    btrim(new.full_name),
    btrim(new.phone),
    new.client_type,
    case when new.client_type = 'Resident' then coalesce(new.emirates_id, '') else '' end,
    case when new.client_type = 'Resident' then new.emirates_id_expiry else null end,
    case when new.client_type = 'Tourist' then coalesce(new.passport_number, '') else '' end,
    case when new.client_type = 'Tourist' then new.passport_expiry else null end,
    btrim(new.nationality),
    nullif(btrim(coalesce(new.email, '')), ''),
    btrim(new.license_number),
    new.license_expiry,
    new.date_of_birth,
    new.passport_photo_url,
    new.eid_front_url,
    new.eid_back_url,
    new.license_front_url,
    new.license_back_url,
    true
  )
  returning id into new_client_id;

  new.status := 'accepted';
  new.reviewed_at := now();
  new.created_client_id := new_client_id;
  new.updated_at := now();

  return new;
end;
$$;

revoke all on function public.auto_accept_client_registration() from public;

drop trigger if exists trg_auto_accept_client_registration
  on public.client_registration_requests;

create trigger trg_auto_accept_client_registration
before insert on public.client_registration_requests
for each row
execute function public.auto_accept_client_registration();
