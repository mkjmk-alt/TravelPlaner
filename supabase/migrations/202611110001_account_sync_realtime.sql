begin;

-- Account-scoped invalidation only. Existing SELECT RLS remains authoritative;
-- clients re-fetch using their authenticated account, never the event payload.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    raise exception 'supabase_realtime publication is required';
  end if;
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime' and not puballtables)
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_sync_records'
     ) then
    alter publication supabase_realtime add table public.user_sync_records;
  end if;
end $$;

-- Fingerprint the complete account metadata in one database snapshot. No
-- timestamp cursor or event order is used, and RLS/ownership remain in force.
create or replace function public.account_sync_fingerprint()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(record_type, record_id, revision, deleted_at)
      order by record_type, record_id
    )::text, '[]'
  ), 'UTF8')), 'hex')
  from public.user_sync_records
  where user_id = (select auth.uid())
$$;
revoke all on function public.account_sync_fingerprint() from public, anon;
grant execute on function public.account_sync_fingerprint() to authenticated;

-- A single-snapshot, account-scoped comparison. Revisions identify changes;
-- no wall-clock cursor is used. Tombstones are returned as changed records.
create or replace function public.account_sync_delta(p_known jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with remote as materialized (
    select user_id, record_type, record_id, payload, revision, updated_at, deleted_at
    from public.user_sync_records where user_id = (select auth.uid())
  ), known as materialized (
    select value ->> 'record_type' as record_type,
           value ->> 'record_id' as record_id,
           value ->> 'revision' as revision,
           value ->> 'deleted' as deleted
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(p_known) = 'array' then
        case when pg_catalog.jsonb_array_length(p_known) <= 5000 then p_known else '[]'::jsonb end
      else '[]'::jsonb end
    )
  )
  select pg_catalog.jsonb_build_object(
    'requires_full', (case when pg_catalog.jsonb_typeof(p_known) = 'array'
        then pg_catalog.jsonb_array_length(p_known) > 5000 else true end)
      or exists (select 1 from known k where not exists (
        select 1 from remote r where r.record_type = k.record_type and r.record_id = k.record_id
      )),
    'records', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.record_type, r.record_id)
      from remote r where not exists (select 1 from known k
        where k.record_type = r.record_type and k.record_id = r.record_id and k.revision = r.revision::text and k.deleted = (r.deleted_at is not null)::text)), '[]'::jsonb)
  )
$$;
revoke all on function public.account_sync_delta(jsonb) from public, anon;
grant execute on function public.account_sync_delta(jsonb) to authenticated;

commit;
