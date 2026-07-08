alter table public.contract_inspections
  drop constraint if exists contract_inspections_type_check;

alter table public.contract_inspections
  add constraint contract_inspections_type_check
  check (
    type = any (
      array[
        'pickup'::text,
        'return'::text,
        'replacement_old_return'::text,
        'replacement_new_handover'::text
      ]
    )
  );
