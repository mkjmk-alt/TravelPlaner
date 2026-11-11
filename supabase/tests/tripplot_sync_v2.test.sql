begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-owner@example.test', '', now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-other@example.test', '', now(), now(), now())
on conflict (id) do nothing;

insert into public.user_sync_records (user_id, record_type, record_id, payload, revision)
values
  ('11111111-1111-4111-8111-111111111111', 'trip', 'own-row', '{"id":"own-row","name":"Private"}', 2),
  ('22222222-2222-4222-8222-222222222222', 'trip', 'other-row', '{"id":"other-row","name":"Not mine"}', 3);

insert into public.shared_trips (id, trip_data, owner_id, management_token_hash)
values (
  '33333333-3333-4333-8333-333333333333',
  '{"id":"shared-row","name":"Original"}',
  '11111111-1111-4111-8111-111111111111',
  null
);

select has_table('public', 'user_sync_records', 'v2 user records table exists');
select has_table('public', 'sync_operation_receipts', 'user operation receipts table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.user_sync_records'::regclass), 'RLS is enabled for user records');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select record_id from public.user_sync_records order by record_id$$,
  $$values ('own-row'::text)$$,
  'authenticated readers see only their own records'
);
select throws_ok(
  $$insert into public.user_sync_records (user_id, record_type, record_id, payload, revision) values ('11111111-1111-4111-8111-111111111111', 'trip', 'direct-write', '{}'::jsonb, 1)$$,
  '42501', null, 'authenticated clients cannot write records directly'
);

select is(
  public.apply_user_sync_operation('trip', 'new-row', 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"id":"new-row","name":"Local"}'::jsonb, null)->>'status',
  'applied', 'first operation is applied'
);
select is(
  public.apply_user_sync_operation('trip', 'new-row', 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"id":"new-row","name":"Local"}'::jsonb, null)->>'status',
  'replayed', 'same operation and body replay the recorded result'
);
select throws_ok(
  $$select public.apply_user_sync_operation('trip', 'new-row', 0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"id":"new-row","name":"Changed"}'::jsonb, null)$$,
  '22023', null, 'an operation ID cannot be reused with a different body'
);
select is(
  public.apply_user_sync_operation('trip', 'new-row', 0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{"id":"new-row","name":"Stale"}'::jsonb, null)->>'status',
  'conflict', 'stale expected revisions return a conflict'
);
select is(
  public.apply_user_sync_operation('trip', 'new-row', 1, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, now())->>'status',
  'applied', 'delete is saved as a new tombstone revision'
);
select ok(
  (select deleted_at is not null and revision = 2 from public.user_sync_records where record_id = 'new-row'),
  'tombstone revision remains in the record table'
);
select is(
  public.apply_user_sync_operation('trip', 'new-row', 1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{"id":"new-row","name":"Old device"}'::jsonb, null)->>'status',
  'conflict', 'an old device cannot revive a tombstoned record'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.apply_user_sync_operation('trip', 'anonymous-row', 0, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '{}'::jsonb, null)$$,
  '42501', null, 'anonymous callers cannot invoke the sync writer'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.apply_shared_trip_operation('33333333-3333-4333-8333-333333333333', 1, '11111111-aaaa-4aaa-8aaa-111111111111', 'update', '{"id":"shared-row","name":"Updated"}'::jsonb)->>'status',
  'applied', 'authorized server update applies to the expected shared revision'
);
select is(
  public.apply_shared_trip_operation('33333333-3333-4333-8333-333333333333', 1, '11111111-aaaa-4aaa-8aaa-111111111111', 'update', '{"id":"shared-row","name":"Updated"}'::jsonb)->>'status',
  'replayed', 'shared update receipt makes a retried operation idempotent'
);
select is(
  public.apply_shared_trip_operation('33333333-3333-4333-8333-333333333333', 1, '22222222-aaaa-4aaa-8aaa-222222222222', 'update', '{"id":"shared-row","name":"Stale"}'::jsonb)->>'status',
  'conflict', 'stale shared-trip revision returns a conflict'
);
select is(
  public.apply_shared_trip_operation('33333333-3333-4333-8333-333333333333', 2, '33333333-aaaa-4aaa-8aaa-333333333333', 'delete', null)->>'status',
  'applied', 'shared-trip deletion applies as a tombstone'
);
select ok(
  (select deleted_at is not null and revision = 3 from public.shared_trips where id = '33333333-3333-4333-8333-333333333333'),
  'shared deletion is retained with its revision instead of hard-deleted'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('trip-media', '11111111-1111-4111-8111-111111111111/photo.jpg')$$,
  'a user can create media only inside their own ID prefix'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('trip-media', '22222222-2222-4222-8222-222222222222/photo.jpg')$$,
  '42501', null, 'a user cannot create media in another account prefix'
);

select * from finish();
rollback;
