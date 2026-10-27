-- Activate an in-progress Draft only after the main customer, manager,
-- and every additional driver have signed. Past rentals and non-Draft
-- statuses stay unchanged. The trigger works whichever signer signs last.
create or replace function internal.activate_fully_signed_draft_contract()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_contract_id uuid;
begin
  if tg_table_name = 'contracts' then
    v_contract_id := new.id;
  else
    v_contract_id := new.contract_id;
  end if;

  update public.contracts c
     set status = 'Active'
   where c.id = v_contract_id
     and c.status = 'Draft'
     and nullif(btrim(c.client_signature), '') is not null
     and nullif(btrim(c.manager_signature), '') is not null
     and not exists (
       select 1
         from public.contract_drivers d
        where d.contract_id = c.id
          and nullif(btrim(d.signature), '') is null
     )
     and (c.end_date + coalesce(c.end_time, time '23:59:59'))
           at time zone 'Asia/Dubai' > now();

  return new;
end;
$$;

create trigger trg_activate_signed_contract_from_contract
after update of client_signature, manager_signature on public.contracts
for each row
when (
  old.client_signature is distinct from new.client_signature
  or old.manager_signature is distinct from new.manager_signature
)
execute function internal.activate_fully_signed_draft_contract();

create trigger trg_activate_signed_contract_from_driver
after update of signature on public.contract_drivers
for each row
when (old.signature is distinct from new.signature)
execute function internal.activate_fully_signed_draft_contract();
