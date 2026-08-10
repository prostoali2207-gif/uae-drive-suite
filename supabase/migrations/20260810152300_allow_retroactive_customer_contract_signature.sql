alter table public.contract_signing_links
add column if not exists allow_customer_resign boolean not null default false;

create or replace function public.create_contract_signing_link(p_contract_id uuid, p_valid_days integer default 7)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid;
  v_token text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_valid_days < 1 or p_valid_days > 30 then raise exception 'Link validity must be between 1 and 30 days'; end if;

  select owner_id into v_owner_id
  from public.contracts
  where id = p_contract_id and owner_id = auth.uid();

  if v_owner_id is null then raise exception 'Contract not found'; end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.contract_signing_links(
    contract_id,
    owner_id,
    token_hash,
    expires_at,
    revoked_at,
    allow_customer_resign,
    updated_at
  )
  values (
    p_contract_id,
    v_owner_id,
    encode(digest(v_token, 'sha256'), 'hex'),
    now() + make_interval(days => p_valid_days),
    null,
    false,
    now()
  )
  on conflict (contract_id) do update set
    token_hash = excluded.token_hash,
    expires_at = excluded.expires_at,
    revoked_at = null,
    allow_customer_resign = false,
    updated_at = now();

  return v_token;
end;
$$;

create or replace function public.get_public_contract_for_signing(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.contract_signing_links%rowtype;
  v_result jsonb;
begin
  if p_token is null or length(p_token) <> 64 then return null; end if;

  select * into v_link
  from public.contract_signing_links
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now();

  if v_link.id is null then return null; end if;

  select jsonb_build_object(
    'contract', jsonb_build_object(
      'id', c.id,
      'start_date', c.start_date,
      'start_time', c.start_time,
      'end_date', c.end_date,
      'end_time', c.end_time,
      'rate_type', c.rate_type,
      'rate_amount', c.rate_amount,
      'total_amount', c.total_amount,
      'deposit_amount', c.deposit_amount,
      'initial_mileage', c.initial_mileage,
      'mileage_unit', c.mileage_unit,
      'fuel_level', c.fuel_level,
      'customer_signed', c.client_signature is not null and not v_link.allow_customer_resign,
      'manager_signed', c.manager_signature is not null
    ),
    'customer', jsonb_build_object(
      'name', cl.full_name,
      'license_number', cl.license_number
    ),
    'vehicle', jsonb_build_object(
      'plate', car.plate,
      'make', car.make,
      'model', car.model,
      'year', car.year,
      'color', car.color
    ),
    'company', jsonb_build_object(
      'name', p.company_name,
      'phone', p.phone_number,
      'terms', p.terms_en,
      'key_terms', p.terms_key_points
    ),
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cd.id,
        'position', cd.position,
        'name', d.full_name,
        'license_number', d.license_number,
        'license_expiry', d.license_expiry,
        'signed', cd.signature is not null
      ) order by cd.position)
      from public.contract_drivers cd
      join public.clients d on d.id = cd.client_id
      where cd.contract_id = c.id
    ), '[]'::jsonb),
    'expires_at', v_link.expires_at,
    'accepted', v_link.accepted_at is not null
  ) into v_result
  from public.contracts c
  join public.clients cl on cl.id = c.client_id
  join public.cars car on car.id = c.car_id
  join public.profiles p on p.id = c.owner_id
  where c.id = v_link.contract_id;

  return v_result;
end;
$$;

create or replace function public.submit_public_contract_signature(
  p_token text,
  p_signer_type text,
  p_driver_id uuid,
  p_signature text,
  p_accept_terms boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.contract_signing_links%rowtype;
  v_manager_signed boolean;
begin
  if p_token is null or length(p_token) <> 64 then raise exception 'Invalid or expired link'; end if;
  if p_signature is null or length(p_signature) < 100 or length(p_signature) > 1500000 or p_signature not like 'data:image/png;base64,%' then
    raise exception 'Invalid signature';
  end if;

  select * into v_link
  from public.contract_signing_links
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now()
  for update;

  if v_link.id is null then raise exception 'Invalid or expired link'; end if;

  select manager_signature is not null into v_manager_signed
  from public.contracts
  where id = v_link.contract_id;

  if v_manager_signed and not (p_signer_type = 'customer' and v_link.allow_customer_resign) then
    raise exception 'Contract signing is already completed';
  end if;

  if not p_accept_terms and v_link.accepted_at is null then raise exception 'Terms must be accepted'; end if;

  if p_signer_type = 'customer' then
    if not v_link.allow_customer_resign and exists (
      select 1 from public.contracts where id = v_link.contract_id and client_signature is not null
    ) then
      raise exception 'Customer has already signed';
    end if;

    update public.contracts
    set client_signature = p_signature
    where id = v_link.contract_id;

    update public.contract_signing_links
    set allow_customer_resign = false
    where id = v_link.id;

  elsif p_signer_type = 'driver' and p_driver_id is not null then
    update public.contract_drivers
    set signature = p_signature,
        signed_at = now()
    where id = p_driver_id
      and contract_id = v_link.contract_id
      and signature is null;

    if not found then raise exception 'Driver not found or already signed'; end if;
  else
    raise exception 'Invalid signer';
  end if;

  update public.contract_signing_links
  set accepted_at = coalesce(accepted_at, case when p_accept_terms then now() end),
      updated_at = now()
  where id = v_link.id;

  return public.get_public_contract_for_signing(p_token);
end;
$$;

revoke all on function public.create_contract_signing_link(uuid, integer) from public;
revoke all on function public.get_public_contract_for_signing(text) from public;
revoke all on function public.submit_public_contract_signature(text, text, uuid, text, boolean) from public;
grant execute on function public.create_contract_signing_link(uuid, integer) to authenticated;
grant execute on function public.get_public_contract_for_signing(text) to anon, authenticated;
grant execute on function public.submit_public_contract_signature(text, text, uuid, text, boolean) to anon, authenticated;
revoke execute on function public.create_contract_signing_link(uuid, integer) from anon;