import assert from 'node:assert/strict';
import test from 'node:test';

import { createSyncV2Repository } from '../src/sync/syncV2Repository.js';

const record = (recordID, payload, revision = 1, type = 'trip') => ({
  user_id: 'user-1',
  record_type: type,
  record_id: recordID,
  payload,
  revision,
  updated_at: `2026-10-14T00:00:0${revision}Z`,
  deleted_at: null
});

const createPagedSupabase = (rows, rpcHandler = async () => ({ data: null, error: null })) => ({
  from(table) {
    assert.equal(table, 'user_sync_records');
    const query = { filters: [], orders: [], start: 0, end: rows.length - 1 };
    const builder = {
      select() { return builder; },
      eq(column, value) { query.filters.push([column, value]); return builder; },
      order(column, options) { query.orders.push([column, options]); return builder; },
      range(start, end) {
        query.start = start;
        query.end = end;
        const userFilter = query.filters.find(([column]) => column === 'user_id');
        const filtered = userFilter ? rows.filter(row => row.user_id === userFilter[1]) : rows;
        return Promise.resolve({ data: filtered.slice(start, end + 1), error: null });
      }
    };
    return builder;
  },
  rpc: rpcHandler
});

const memoryQueue = () => {
  const values = new Map();
  return {
    values,
    async put(operation) { values.set(operation.operationID, structuredClone(operation)); },
    async list(userID) { return [...values.values()].filter(item => item.userID === userID); },
    async remove(operationID) { values.delete(operationID); }
  };
};

test('listRecords uses an opaque cursor across pages and returns normalized records', async () => {
  const rows = [record('one', { id: 'one' }), record('two', { id: 'two' }), record('three', { id: 'three' })];
  const repository = createSyncV2Repository({ supabase: createPagedSupabase(rows), queueStore: memoryQueue(), pageSize: 2 });

  const firstPage = await repository.listRecords('user-1');
  const secondPage = await repository.listRecords('user-1', firstPage.nextCursor);

  assert.deepEqual(firstPage.records.map(item => item.recordID), ['one', 'two']);
  assert.equal(firstPage.nextCursor, '2');
  assert.deepEqual(secondPage.records.map(item => item.recordID), ['three']);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(secondPage.records[0].revision, 1);
});

test('applyOperation preserves an operation ID across a transient retry and removes it only after replay succeeds', async () => {
  const queueStore = memoryQueue();
  const operationIDs = [];
  let attempt = 0;
  const repository = createSyncV2Repository({
    supabase: createPagedSupabase([], async (_name, params) => {
      operationIDs.push(params.p_operation_id);
      attempt += 1;
      if (attempt === 1) return { data: null, error: new Error('temporary network error') };
      return { data: { status: 'replayed', record: record('trip-1', { id: 'trip-1' }) }, error: null };
    }),
    queueStore
  });
  const operation = {
    userID: 'user-1', type: 'trip', recordID: 'trip-1', expectedRevision: 0,
    operationID: '11111111-1111-4111-8111-111111111111', payload: { id: 'trip-1' }, deletedAt: null
  };

  await assert.rejects(repository.applyOperation(operation), /temporary network error/);
  assert.equal((await queueStore.list('user-1')).length, 1);
  const result = await repository.applyOperation(operation);

  assert.equal(result.status, 'replayed');
  assert.deepEqual(operationIDs, [operation.operationID, operation.operationID]);
  assert.equal((await queueStore.list('user-1')).length, 0);
});

test('applyOperation returns the current server record on conflict without discarding the local operation', async () => {
  const queueStore = memoryQueue();
  const repository = createSyncV2Repository({
    supabase: createPagedSupabase([], async () => ({
      data: { status: 'conflict', record: record('trip-1', { id: 'trip-1', name: 'server' }, 3) },
      error: null
    })),
    queueStore
  });
  const operation = {
    userID: 'user-1', type: 'trip', recordID: 'trip-1', expectedRevision: 2,
    operationID: '22222222-2222-4222-8222-222222222222', payload: { id: 'trip-1', name: 'local' }, deletedAt: null
  };

  const result = await repository.applyOperation(operation);

  assert.equal(result.status, 'conflict');
  assert.equal(result.record.revision, 3);
  assert.equal(result.record.payload.name, 'server');
  assert.equal((await queueStore.list('user-1'))[0].payload.name, 'local');
});

test('importLegacyRows imports missing records, skips identical records, and reports conflicts without overwriting', async () => {
  const rows = [record('existing', { id: 'existing', name: 'server' }, 2)];
  const applied = [];
  const supabase = createPagedSupabase(rows, async (_name, params) => {
    applied.push(params);
    const result = record(params.p_record_id, params.p_payload);
    rows.push(result);
    return { data: { status: 'applied', record: result }, error: null };
  });
  const repository = createSyncV2Repository({
    supabase,
    queueStore: memoryQueue(),
    makeOperationID: () => '33333333-3333-4333-8333-333333333333'
  });
  const legacyRows = [{
    key: 'world_pro_trips_v1',
    value: [
      { id: 'existing', name: 'local' },
      { id: 'new-trip', name: 'Local only' }
    ]
  }];

  const first = await repository.importLegacyRows('user-1', legacyRows);
  const repeated = await repository.importLegacyRows('user-1', legacyRows);

  assert.equal(first.imported.length, 1);
  assert.equal(first.imported[0].recordID, 'new-trip');
  assert.equal(first.conflicts.length, 1);
  assert.equal(first.conflicts[0].local.payload.name, 'local');
  assert.equal(first.conflicts[0].remote.payload.name, 'server');
  assert.equal(repeated.imported.length, 0);
  assert.equal(applied.length, 1);
});

test('ambiguous local and account v1 copies are excluded from safe import and originals remain represented', async () => {
  const applied = [];
  const repository = createSyncV2Repository({
    supabase: createPagedSupabase([], async (_name, params) => {
      applied.push(params);
      return { data: { status: 'applied', record: record(params.p_record_id, params.p_payload) }, error: null };
    }),
    queueStore: memoryQueue(),
    makeOperationID: () => '44444444-4444-4444-8444-444444444444'
  });
  const rows = [
    { key: 'world_pro_trips_v1', value: [{ id: 'same-trip', name: 'Account copy' }] },
    { key: 'world_pro_trips_v1', value: [{ id: 'same-trip', name: 'Device copy' }] }
  ];

  const preview = await repository.previewLegacyRows('user-1', rows);
  const result = await repository.importLegacyRows('user-1', rows);

  assert.equal(preview.importable.length, 0);
  assert.equal(preview.conflicts.length, 1);
  assert.equal(preview.conflicts[0].local.payload.name, 'Device copy');
  assert.equal(result.conflicts.length, 1);
  assert.equal(applied.length, 0);
});

test('an explicit local conflict choice applies with the latest known revision', async () => {
  const rows = [record('existing', { id: 'existing', name: 'server' }, 4)];
  let rpcParameters;
  const repository = createSyncV2Repository({
    supabase: createPagedSupabase(rows, async (_name, params) => {
      rpcParameters = params;
      const updated = record(params.p_record_id, params.p_payload, 5);
      rows.splice(0, rows.length, updated);
      return { data: { status: 'applied', record: updated }, error: null };
    }),
    queueStore: memoryQueue(),
    makeOperationID: () => '55555555-5555-4555-8555-555555555555'
  });

  const result = await repository.importLegacyRows('user-1', [{
    key: 'world_pro_trips_v1', value: [{ id: 'existing', name: 'device' }]
  }], { conflictChoices: { 'trip:existing': 'local' } });

  assert.equal(result.imported.length, 1);
  assert.equal(rpcParameters.p_expected_revision, 4);
  assert.equal(rpcParameters.p_payload.name, 'device');
});
