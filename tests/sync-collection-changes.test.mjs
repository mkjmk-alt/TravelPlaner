import test from 'node:test';
import assert from 'node:assert/strict';
import { planCollectionChanges, syncRecordsUnchanged } from '../src/sync/collectionChanges.js';
import { createSyncV2Repository } from '../src/sync/syncV2Repository.js';

const record = (id, revision = 1) => ({ userID: 'user', type: 'trip', recordID: id, revision, deletedAt: null });
const base = (entries) => new Map(entries.map(([id, payload, revision]) => [`trip:${id}`, { record: record(id, revision), payload }]));

test('uploads only local changes and leaves unseen server additions alone', () => {
  const baseline = base([['a', { id: 'a', name: 'old' }, 3]]);
  const operations = planCollectionChanges('trip', 'user', baseline, [{ id: 'a', name: 'new' }]);
  assert.deepEqual(operations, [{ type: 'trip', recordID: 'a', expectedRevision: 3, payload: { id: 'a', name: 'new' }, deleted: false }]);
});

test('deletes only records present in the displayed baseline', () => {
  const operations = planCollectionChanges('trip', 'user', base([['a', { id: 'a' }, 2]]), []);
  assert.deepEqual(operations, [{ type: 'trip', recordID: 'a', expectedRevision: 2, payload: null, deleted: true }]);
});

test('unchanged content is not overwritten and a new record starts at revision zero', () => {
  const baseline = base([['a', { id: 'a', name: 'same' }, 7]]);
  const operations = planCollectionChanges('trip', 'user', baseline, [{ name: 'same', id: 'a' }, { id: 'b' }]);
  assert.deepEqual(operations, [{ type: 'trip', recordID: 'b', expectedRevision: 0, payload: { id: 'b' }, deleted: false }]);
});

test('a remote edit conflicts instead of being overwritten and remains queued', async () => {
  const pending = new Map();
  const queueStore = {
    async put(operation) { pending.set(operation.operationID, operation); },
    async list() { return [...pending.values()]; },
    async remove(id) { pending.delete(id); }
  };
  const remote = { user_id: 'user', record_type: 'trip', record_id: 'a', revision: 4, payload: { id: 'a', name: 'remote' }, updated_at: '2026-01-01T00:00:00Z', deleted_at: null };
  const supabase = {
    from() {},
    async rpc(_name, params) {
      assert.equal(params.p_expected_revision, 3);
      return { data: { status: 'conflict', record: remote }, error: null };
    }
  };
  const repository = createSyncV2Repository({ supabase, queueStore });
  const [change] = planCollectionChanges('trip', 'user', base([['a', { id: 'a', name: 'old' }, 3]]), [{ id: 'a', name: 'local' }]);
  const result = await repository.applyOperation({ ...change, userID: 'user', operationID: '11111111-1111-4111-8111-111111111111', deletedAt: null });
  assert.equal(result.status, 'conflict');
  assert.equal(result.record.payload.name, 'remote');
  assert.equal((await queueStore.list())[0].payload.name, 'local');
});

test('saving a local edit never deletes a trip added remotely after the baseline', async () => {
  const remote = new Map([
    ['a', { id: 'a', name: 'old' }],
    ['b', { id: 'b', name: 'added on phone' }]
  ]);
  const baseline = base([['a', { id: 'a', name: 'old' }, 1]]);
  const changes = planCollectionChanges('trip', 'user', baseline, [{ id: 'a', name: 'edited on web' }]);
  const queueStore = { async put() {}, async list() { return []; }, async remove() {} };
  const supabase = {
    from() {},
    async rpc(_name, params) {
      if (params.p_deleted_at) remote.delete(params.p_record_id);
      else remote.set(params.p_record_id, params.p_payload);
      return { data: { status: 'applied', record: { user_id: 'user', record_type: 'trip', record_id: params.p_record_id, revision: 2, payload: params.p_payload, updated_at: '2026-01-01T00:00:00Z', deleted_at: params.p_deleted_at } }, error: null };
    }
  };
  const repository = createSyncV2Repository({ supabase, queueStore });
  for (const change of changes) {
    await repository.applyOperation({ ...change, userID: 'user', operationID: '22222222-2222-4222-8222-222222222222', deletedAt: change.deleted ? '2026-01-01T00:00:00Z' : null });
  }
  assert.equal(remote.get('a').name, 'edited on web');
  assert.equal(remote.get('b').name, 'added on phone');
});

test('unchanged server revisions do not require replacing the visible list', () => {
  const known = new Map([['trip:a', record('a', 2)]]);
  assert.equal(syncRecordsUnchanged(known, [record('a', 2)]), true);
  assert.equal(syncRecordsUnchanged(known, [record('a', 3)]), false);
  assert.equal(syncRecordsUnchanged(known, [record('a', 2), record('b', 1)]), false);
  assert.equal(syncRecordsUnchanged(known, [{ ...record('a', 2), deletedAt: '2026-01-01' }]), false);
});
