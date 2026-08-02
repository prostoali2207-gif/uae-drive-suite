alter table public.clients
  add column if not exists license_type text,
  add column if not exists license_issuing_country text,
  add column if not exists traffic_file_number text;

alter table public.clients
  drop constraint if exists clients_license_type_check;

alter table public.clients
  add constraint clients_license_type_check
  check (license_type is null or license_type in ('uae', 'foreign', 'international'));

comment on column public.clients.license_type is
  'Driving licence type: uae, foreign, or international.';

comment on column public.clients.license_issuing_country is
  'Country that issued the foreign or international driving licence.';

comment on column public.clients.traffic_file_number is
  'UAE traffic file number used for government traffic forms.';
