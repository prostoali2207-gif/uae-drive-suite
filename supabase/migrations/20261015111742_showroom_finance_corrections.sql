-- Showroom-only serialized corrections; no changes to Rental records or policy.
create table public.showroom_finance_corrections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  original_id uuid not null references public.telegram_operation_requests(id),
  actor_staff_id uuid not null references public.staff(id),
  actor_name text not null,
  request_id text not null check (request_id ~ '^[a-zA-Z0-9_-]{8,100}$'),
  kind text not null check (kind in ('edit','cancel')),
  version integer not null check (version > 0),
  before_payload jsonb not null,
  after_payload jsonb not null,
  before_result jsonb not null,
  driver_before jsonb,
  sheet_before jsonb not null,
  status text not null default 'pending' check (status in ('pending','applied')),
  bridge_result jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique(owner_id,request_id),
  unique(original_id,version)
);
create unique index showroom_finance_one_pending_correction
  on public.showroom_finance_corrections(original_id) where status='pending';
alter table public.showroom_finance_corrections enable row level security;
revoke all on public.showroom_finance_corrections from public, anon, authenticated;
grant select,insert,update on public.showroom_finance_corrections to service_role;

alter table public.showroom_driver_movements drop constraint showroom_driver_movements_status_check;
alter table public.showroom_driver_movements add constraint showroom_driver_movements_status_check
  check (status in ('pending','applied','failed','cancelled'));

create function public.showroom_correction_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP='DELETE' then raise exception 'Correction audit cannot be deleted'; end if;
  if old.status='applied' or
     (to_jsonb(new) - array['status','bridge_result','applied_at']) is distinct from
     (to_jsonb(old) - array['status','bridge_result','applied_at']) or
     new.status <> 'applied' or new.applied_at is null or new.bridge_result is null then
    raise exception 'Correction audit is immutable';
  end if;
  return new;
end $$;
create trigger showroom_correction_immutable before update or delete on public.showroom_finance_corrections
for each row execute function public.showroom_correction_immutable();
revoke all on function public.showroom_correction_immutable() from public,anon,authenticated;

create function public.showroom_begin_finance_correction(
 p_owner_id uuid, p_actor_staff_id uuid, p_original_id uuid, p_request_id text,
 p_expected_version integer, p_kind text, p_after_payload jsonb, p_sheet_before jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 orig public.telegram_operation_requests%rowtype;
 correction public.showroom_finance_corrections%rowtype;
 driver public.showroom_driver_movements%rowtype;
 actor text;
 next_payload jsonb;
 current_version integer;
begin
 select full_name into actor from public.staff where id=p_actor_staff_id and owner_id=p_owner_id
   and status='active' and lower(role) in ('owner','manager');
 if not found then raise exception 'Only active owner or manager may correct showroom finance'; end if;
 if p_kind is null or p_kind not in ('edit','cancel') or p_request_id is null
    or p_request_id !~ '^[a-zA-Z0-9_-]{8,100}$' or p_expected_version is null or p_expected_version<0
    or p_after_payload is null or jsonb_typeof(p_after_payload)<>'object' then
   raise exception 'Invalid correction request';
 end if;
 -- Lock original first in both RPCs. It serializes different requests for the same entry.
 select * into orig from public.telegram_operation_requests where id=p_original_id and owner_id=p_owner_id for update;
 if not found or orig.action <> 'record_showroom_finance_entry' or orig.payload->>'ledger' is distinct from 'showroom' then
   raise exception 'Showroom operation not found';
 end if;
 select * into correction from public.showroom_finance_corrections where owner_id=p_owner_id and request_id=p_request_id;
 if found then
   if correction.original_id<>p_original_id or correction.actor_staff_id<>p_actor_staff_id
      or correction.kind<>p_kind or correction.version<>p_expected_version+1 or correction.after_payload<>p_after_payload or correction.sheet_before is distinct from p_sheet_before then
     raise exception 'Request ID already used with different correction';
   end if;
   return to_jsonb(correction);
 end if;
 if p_sheet_before is null or jsonb_typeof(p_sheet_before)<>'object' or
    nullif(orig.result->>'request_id','') is null or
    p_sheet_before->>'request_id' is distinct from orig.result->>'request_id' or
    p_sheet_before->>'date' is distinct from orig.payload->>'date' or
    p_sheet_before->>'account_label' is distinct from
      (case orig.payload->>'account' when 'cash_aed' then 'Касса' when 'ajman_aed' then 'AJMAN' end) or
    (p_sheet_before->>'amount')::numeric is distinct from (orig.payload->>'amount')::numeric or
    p_sheet_before->>'article' is distinct from orig.payload->>'article' or
    coalesce(p_sheet_before->>'note','') is distinct from coalesce(orig.payload->>'sheet_note',orig.payload->>'note','') or
    (p_sheet_before->>'version')::integer is distinct from coalesce((orig.result->>'correction_version')::integer,0) then
   raise exception 'Sheet snapshot differs from recorded entry; refresh history';
 end if;
 if orig.status<>'applied' or coalesce((orig.result->>'cancelled')::boolean,false) then
   raise exception 'Only applied noncancelled entries may be corrected';
 end if;
 current_version:=coalesce((orig.result->>'correction_version')::integer,0);
 if current_version<>p_expected_version then raise exception 'Entry changed; refresh history'; end if;
 if exists(select 1 from public.showroom_finance_corrections where original_id=orig.id and status='pending') then
   raise exception 'Previous correction still syncing; retry it first';
 end if;
 if lower(coalesce(orig.payload->>'article','')) in
   (lower('перевод на счет в AJMAN'),lower('перевод в КАССУ'),lower('приход со счета AJMAN'),lower('приход из кассы'))
   or orig.result ? 'transfer' or nullif(orig.result->'transfer_pair','null'::jsonb) is not null then
   raise exception 'Paired transfers cannot be corrected individually';
 end if;
 if orig.payload->>'account' is null or orig.payload->>'account' not in ('cash_aed','ajman_aed') then raise exception 'Unsupported showroom account'; end if;
 next_payload:=p_after_payload;
 if p_kind='cancel' then
   if next_payload<>orig.payload then raise exception 'Cancellation must retain original values'; end if;
 else
   if (next_payload - array['amount','article','row','vehicle','note','sheet_note']) <>
      (orig.payload - array['amount','article','row','vehicle','note','sheet_note']) then
     raise exception 'Date, ledger, account and identity cannot be changed';
   end if;
   if jsonb_typeof(next_payload->'amount') is distinct from 'number' or
      (next_payload->>'amount')::numeric<=0 or (next_payload->>'amount')::numeric>9999999999.99 or
      (next_payload->>'amount')::numeric<>round((next_payload->>'amount')::numeric,2) or
      length(coalesce(next_payload->>'note',''))>500 or length(coalesce(next_payload->>'sheet_note',''))>700 or length(coalesce(next_payload->>'vehicle',''))>160 then
     raise exception 'Invalid correction amount or text';
   end if;
   if lower(coalesce(next_payload->>'article','')) in
      (lower('перевод на счет в AJMAN'),lower('перевод в КАССУ'),lower('приход со счета AJMAN'),lower('приход из кассы')) then
     raise exception 'Cannot change an entry into a paired transfer';
   end if;
   if not exists(select 1 from public.showroom_finance_operation_catalog c where c.active
      and c.article=next_payload->>'article'
      and c.direction=case next_payload->>'direction' when 'income' then 'Приход' when 'expense' then 'Расход' end
      and case next_payload->>'account' when 'cash_aed' then c.cash_row else c.ajman_row end=(next_payload->>'row')::integer) then
     raise exception 'Operation is not in the active showroom catalog';
   end if;
 end if;
 select * into driver from public.showroom_driver_movements where finance_audit_id=orig.id for update;
 if found then
   if driver.owner_id<>p_owner_id or driver.status<>'applied' or driver.sheet_sync_status<>'synced' or driver.kind<>'expense' then
     raise exception 'Driver expense must finish synchronization before correction';
   end if;
   if next_payload->>'direction'<>'expense' then raise exception 'Driver expense must remain an expense'; end if;
 end if;
 insert into public.showroom_finance_corrections(owner_id,original_id,actor_staff_id,actor_name,request_id,kind,version,
   before_payload,after_payload,before_result,driver_before,sheet_before)
 values(p_owner_id,p_original_id,p_actor_staff_id,actor,p_request_id,p_kind,current_version+1,
   orig.payload,next_payload,coalesce(orig.result,'{}'::jsonb),case when driver.id is not null then to_jsonb(driver) end,p_sheet_before)
 returning * into correction;
 return to_jsonb(correction);
end $$;

create function public.showroom_finalize_finance_correction(
 p_owner_id uuid, p_actor_staff_id uuid, p_correction_id uuid, p_bridge_result jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 correction public.showroom_finance_corrections%rowtype;
 orig public.telegram_operation_requests%rowtype;
 original_uuid uuid;
 driver public.showroom_driver_movements%rowtype;
begin
 if not exists(select 1 from public.staff where id=p_actor_staff_id and owner_id=p_owner_id
   and status='active' and lower(role) in ('owner','manager')) then
   raise exception 'Only active owner or manager may finalize showroom finance';
 end if;
 select original_id into original_uuid from public.showroom_finance_corrections
 where id=p_correction_id and owner_id=p_owner_id and actor_staff_id=p_actor_staff_id;
 if not found then raise exception 'Correction not found'; end if;
 select * into orig from public.telegram_operation_requests where id=original_uuid and owner_id=p_owner_id for update;
 select * into correction from public.showroom_finance_corrections where id=p_correction_id for update;
 if correction.status='applied' then return to_jsonb(correction); end if;
 if p_bridge_result is null or p_bridge_result->>'ok' is distinct from 'true' or
   p_bridge_result->>'correction_id' is distinct from correction.id::text or
   p_bridge_result->>'version' is distinct from correction.version::text then
   raise exception 'Bridge did not confirm this correction version';
 end if;
 if orig.status<>'applied' or orig.payload<>correction.before_payload or
    coalesce((orig.result->>'correction_version')::integer,0)<>correction.version-1 or
    coalesce((orig.result->>'cancelled')::boolean,false) then
   raise exception 'Original entry changed while correction was pending';
 end if;
 if correction.driver_before is not null then
   select * into driver from public.showroom_driver_movements
     where id=(correction.driver_before->>'id')::uuid and owner_id=p_owner_id for update;
   if not found or to_jsonb(driver)<>correction.driver_before then
     raise exception 'Driver entry changed while correction was pending';
   end if;
   update public.showroom_driver_movements set
     amount=case when correction.kind='cancel' then driver.amount else (correction.after_payload->>'amount')::numeric end,
     article=case when correction.kind='cancel' then driver.article else correction.after_payload->>'article' end,
     vehicle=case when correction.kind='cancel' then driver.vehicle else correction.after_payload->>'vehicle' end,
     note=case when correction.kind='cancel' then driver.note else correction.after_payload->>'note' end,
     status=case when correction.kind='cancel' then 'cancelled' else 'applied' end,
     sheet_sync_status='synced',error_message=null
   where id=driver.id;
 end if;
 update public.telegram_operation_requests set payload=correction.after_payload,
   result=coalesce(result,'{}'::jsonb) || jsonb_build_object('correction_version',correction.version,
     'cancelled',correction.kind='cancel','last_correction_id',correction.id,
     'corrected_by',correction.actor_name,'corrected_at',now()),processed_at=now()
 where id=orig.id;
 update public.showroom_finance_corrections set status='applied',bridge_result=p_bridge_result,applied_at=now()
 where id=correction.id returning * into correction;
 return to_jsonb(correction);
end $$;
revoke all on function public.showroom_begin_finance_correction(uuid,uuid,uuid,text,integer,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.showroom_finalize_finance_correction(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.showroom_begin_finance_correction(uuid,uuid,uuid,text,integer,text,jsonb,jsonb) to service_role;
grant execute on function public.showroom_finalize_finance_correction(uuid,uuid,uuid,jsonb) to service_role;
