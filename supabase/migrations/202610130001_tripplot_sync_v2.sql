begin;

create table if not exists public.user_sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('trip', 'savedPlace')),
  record_id text not null check (length(record_id) between 1 and 200),
  payload jsonb,
  revision bigint not null check (revision >= 1),
  updated_at timestamptz not null default transaction_timestamp(),
  deleted_at timestamptz,
  primary key (user_id, record_type, record_id),
  check (payload is null or jsonb_typeof(payload) = 'object')
);

create index if not exists user_sync_records_user_cursor_idx
  on public.user_sync_records (user_id, updated_at, record_type, record_id);

alter table public.user_sync_records enable row level security;
drop policy if exists "sync records owner read" on public.user_sync_records;
create policy "sync records owner read"
  on public.user_sync_records
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.user_sync_records from public, anon, authenticated;
grant select on table public.user_sync_records to authenticated;
grant all on table public.user_sync_records to service_role;

create table if not exists public.sync_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  record_type text not null check (record_type in ('trip', 'savedPlace')),
  record_id text not null check (length(record_id) between 1 and 200),
  expected_revision bigint not null check (expected_revision >= 0),
  payload jsonb,
  requested_deleted_at timestamptz,
  result jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (user_id, operation_id),
  check (payload is null or jsonb_typeof(payload) = 'object')
);

alter table public.sync_operation_receipts enable row level security;
revoke all on table public.sync_operation_receipts from public, anon, authenticated;
grant all on table public.sync_operation_receipts to service_role;

create or replace function public.apply_user_sync_operation(
  p_record_type text,
  p_record_id text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_payload jsonb,
  p_deleted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt public.sync_operation_receipts%rowtype;
  v_record public.user_sync_records%rowtype;
  v_record_json jsonb;
  v_result jsonb;
  v_found boolean := false;
begin
  if v_user_id is null or auth.role() is distinct from 'authenticated' then
    raise exception 'authenticated user required' using errcode = '42501';
  end if;
  if p_record_type not in ('trip', 'savedPlace') then
    raise exception 'unsupported record type' using errcode = '22023';
  end if;
  if p_record_id is null or length(btrim(p_record_id)) = 0 or length(p_record_id) > 200 then
    raise exception 'invalid record id' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_operation_id is null then
    raise exception 'invalid operation metadata' using errcode = '22023';
  end if;
  if p_deleted_at is null and (p_payload is null or jsonb_typeof(p_payload) <> 'object') then
    raise exception 'active record payload must be a JSON object' using errcode = '22023';
  end if;
  if p_deleted_at is not null and p_payload is not null then
    raise exception 'tombstone payload must be null' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('user-operation:' || v_user_id::text || ':' || p_operation_id::text, 0)
  );
  select * into v_receipt
  from public.sync_operation_receipts
  where user_id = v_user_id and operation_id = p_operation_id;

  if found then
    if v_receipt.record_type is distinct from p_record_type
      or v_receipt.record_id is distinct from p_record_id
      or v_receipt.expected_revision is distinct from p_expected_revision
      or v_receipt.payload is distinct from p_payload
      or v_receipt.requested_deleted_at is distinct from p_deleted_at then
      raise exception 'operation id reused with a different request' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_set(v_receipt.result, '{status}', '"replayed"'::jsonb, false);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'user-record:' || v_user_id::text || ':' || p_record_type || ':' || p_record_id,
      0
    )
  );
  select * into v_record
  from public.user_sync_records
  where user_id = v_user_id and record_type = p_record_type and record_id = p_record_id
  for update;
  v_found := found;

  if (v_found and v_record.revision <> p_expected_revision)
    or (not v_found and p_expected_revision <> 0) then
    if v_found then
      v_record_json := pg_catalog.jsonb_build_object(
        'user_id', v_record.user_id,
        'record_type', v_record.record_type,
        'record_id', v_record.record_id,
        'payload', v_record.payload,
        'revision', v_record.revision,
        'updated_at', v_record.updated_at,
        'deleted_at', v_record.deleted_at
      );
    else
      v_record_json := null;
    end if;
    v_result := pg_catalog.jsonb_build_object('status', 'conflict', 'record', v_record_json);
  else
    if v_found then
      update public.user_sync_records
      set payload = case when p_deleted_at is null then p_payload else null end,
          revision = v_record.revision + 1,
          updated_at = transaction_timestamp(),
          deleted_at = case when p_deleted_at is null then null else transaction_timestamp() end
      where user_id = v_user_id and record_type = p_record_type and record_id = p_record_id
      returning * into v_record;
    else
      insert into public.user_sync_records (
        user_id, record_type, record_id, payload, revision, updated_at, deleted_at
      ) values (
        v_user_id,
        p_record_type,
        p_record_id,
        case when p_deleted_at is null then p_payload else null end,
        1,
        transaction_timestamp(),
        case when p_deleted_at is null then null else transaction_timestamp() end
      ) returning * into v_record;
    end if;
    v_record_json := pg_catalog.jsonb_build_object(
      'user_id', v_record.user_id,
      'record_type', v_record.record_type,
      'record_id', v_record.record_id,
      'payload', v_record.payload,
      'revision', v_record.revision,
      'updated_at', v_record.updated_at,
      'deleted_at', v_record.deleted_at
    );
    v_result := pg_catalog.jsonb_build_object('status', 'applied', 'record', v_record_json);
  end if;

  insert into public.sync_operation_receipts (
    user_id, operation_id, record_type, record_id, expected_revision,
    payload, requested_deleted_at, result
  ) values (
    v_user_id, p_operation_id, p_record_type, p_record_id, p_expected_revision,
    p_payload, p_deleted_at, v_result
  );
  return v_result;
end;
$$;

revoke all on function public.apply_user_sync_operation(text, text, bigint, uuid, jsonb, timestamptz)
  from public, anon;
grant execute on function public.apply_user_sync_operation(text, text, bigint, uuid, jsonb, timestamptz)
  to authenticated;

create table if not exists public.shared_trip_operation_receipts (
  trip_id uuid not null references public.shared_trips(id) on delete cascade,
  operation_id uuid not null,
  expected_revision bigint not null check (expected_revision >= 1),
  operation_type text not null check (operation_type in ('update', 'delete')),
  trip_data jsonb,
  result jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (trip_id, operation_id),
  check (trip_data is null or jsonb_typeof(trip_data) = 'object'),
  check ((operation_type = 'update' and trip_data is not null) or (operation_type = 'delete' and trip_data is null))
);

alter table public.shared_trips
  add column if not exists revision bigint not null default 1 check (revision >= 1),
  add column if not exists deleted_at timestamptz;

alter table public.shared_trip_operation_receipts enable row level security;
revoke all on table public.shared_trip_operation_receipts from public, anon, authenticated;
grant all on table public.shared_trip_operation_receipts to service_role;

create or replace function public.apply_shared_trip_operation(
  p_trip_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_operation_type text,
  p_trip_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.shared_trips%rowtype;
  v_receipt public.shared_trip_operation_receipts%rowtype;
  v_trip_json jsonb;
  v_result jsonb;
  v_found boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'server role required' using errcode = '42501';
  end if;
  if p_trip_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'invalid operation metadata' using errcode = '22023';
  end if;
  if p_operation_type not in ('update', 'delete') then
    raise exception 'unsupported shared trip operation' using errcode = '22023';
  end if;
  if (p_operation_type = 'update' and (p_trip_data is null or jsonb_typeof(p_trip_data) <> 'object'))
    or (p_operation_type = 'delete' and p_trip_data is not null) then
    raise exception 'invalid shared trip operation payload' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shared-operation:' || p_trip_id::text || ':' || p_operation_id::text, 0)
  );
  select * into v_receipt
  from public.shared_trip_operation_receipts
  where trip_id = p_trip_id and operation_id = p_operation_id;
  if found then
    if v_receipt.expected_revision is distinct from p_expected_revision
      or v_receipt.operation_type is distinct from p_operation_type
      or v_receipt.trip_data is distinct from p_trip_data then
      raise exception 'operation id reused with a different request' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_set(v_receipt.result, '{status}', '"replayed"'::jsonb, false);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shared-trip:' || p_trip_id::text, 0)
  );
  select * into v_trip from public.shared_trips where id = p_trip_id for update;
  v_found := found;
  if not v_found then
    v_trip_json := null;
    v_result := pg_catalog.jsonb_build_object('status', 'conflict', 'trip', v_trip_json);
  elsif v_trip.revision <> p_expected_revision or v_trip.deleted_at is not null then
    v_trip_json := pg_catalog.jsonb_build_object(
      'id', v_trip.id,
      'trip_data', v_trip.trip_data,
      'updated_at', v_trip.updated_at,
      'revision', v_trip.revision,
      'deleted_at', v_trip.deleted_at
    );
    v_result := pg_catalog.jsonb_build_object('status', 'conflict', 'trip', v_trip_json);
  else
    update public.shared_trips
    set trip_data = case when p_operation_type = 'update' then p_trip_data else trip_data end,
        deleted_at = case when p_operation_type = 'delete' then transaction_timestamp() else null end,
        revision = revision + 1,
        updated_at = transaction_timestamp()
    where id = p_trip_id
    returning * into v_trip;
    v_trip_json := pg_catalog.jsonb_build_object(
      'id', v_trip.id,
      'trip_data', v_trip.trip_data,
      'updated_at', v_trip.updated_at,
      'revision', v_trip.revision,
      'deleted_at', v_trip.deleted_at
    );
    v_result := pg_catalog.jsonb_build_object('status', 'applied', 'trip', v_trip_json);
  end if;

  insert into public.shared_trip_operation_receipts (
    trip_id, operation_id, expected_revision, operation_type, trip_data, result
  ) values (
    p_trip_id, p_operation_id, p_expected_revision, p_operation_type, p_trip_data, v_result
  );
  return v_result;
end;
$$;

revoke all on function public.apply_shared_trip_operation(uuid, bigint, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_shared_trip_operation(uuid, bigint, uuid, text, jsonb)
  to service_role;

comment on table public.user_sync_records is
  'Account-scoped TripPlot v2 records. Client writes must go through apply_user_sync_operation.';
comment on table public.sync_operation_receipts is
  'Immutable idempotency receipts for user sync operations; retained with tombstones.';
comment on column public.shared_trips.revision is
  'Server-owned optimistic concurrency revision for shared-trip edits.';
comment on column public.shared_trips.deleted_at is
  'Server-owned deletion tombstone; public reads must hide deleted shares.';

notify pgrst, 'reload schema';

commit;
