begin;

alter table public.shared_trips
  add column if not exists management_token_hash text;

alter table public.shared_trips
  drop constraint if exists shared_trips_management_token_hash_format;

alter table public.shared_trips
  add constraint shared_trips_management_token_hash_format
  check (
    management_token_hash is null
    or management_token_hash ~ '^[0-9a-f]{64}$'
  );

comment on column public.shared_trips.management_token_hash is
  'SHA-256 hash of the creator-only token used to revoke a shared trip. Null identifies a legacy share.';

commit;
