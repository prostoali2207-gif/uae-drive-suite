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
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Invalid or expired link';
  end if;

  if p_signature is null
     or length(p_signature) < 100
     or length(p_signature) > 1500000
     or p_signature not like 'data:image/png;base64,%' then
    raise exception 'Invalid signature';
  end if;

  select * into v_link
  from public.contract_signing_links
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now()
  for update;

  if v_link.id is null then
    raise exception 'Invalid or expired link';
  end if;

  if not p_accept_terms and v_link.accepted_at is null then
    raise exception 'Terms must be accepted';
  end if;

  if p_signer_type = 'customer' then
    if exists (
      select 1
      from public.contracts
      where id = v_link.contract_id
        and client_signature is not null
    ) then
      raise exception 'Signature already recorded';
    end if;

    update public.contracts
    set client_signature = p_signature
    where id = v_link.contract_id;

  elsif p_signer_type = 'driver' and p_driver_id is not null then
    if exists (
      select 1
      from public.contract_drivers
      where id = p_driver_id
        and contract_id = v_link.contract_id
        and signature is not null
    ) then
      raise exception 'Signature already recorded';
    end if;

    update public.contract_drivers
    set signature = p_signature,
        signed_at = now()
    where id = p_driver_id
      and contract_id = v_link.contract_id;

    if not found then
      raise exception 'Driver not found';
    end if;
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

revoke all on function public.submit_public_contract_signature(text,text,uuid,text,boolean) from public;
grant execute on function public.submit_public_contract_signature(text,text,uuid,text,boolean) to anon, authenticated;
