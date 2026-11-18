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

test('startup accepts server changes and deletions for rows unchanged since the last login', async () => {
  const { createSyncCheckpoint, planStartupSync } = await import('../src/sync/localSyncStorage.js');
  const original = { id: 'a', name: 'same' };
  const checkpoint = await createSyncCheckpoint('user', base([['a', original, 2]]));
  for (const remote of [
    { ...record('a', 3), payload: { id: 'a', name: 'changed in app' } },
    { ...record('a', 3), deletedAt: '2026-01-01', payload: null }
  ]) {
    const result = await planStartupSync('user', checkpoint, [{ type: 'trip', recordID: 'a', payload: original }], [remote]);
    assert.deepEqual(result, { changes: [], review: [] });
  }
  const candidate = { type: 'trip', recordID: 'a', payload: original };
  assert.deepEqual(await planStartupSync('user', checkpoint, [candidate], []), { changes: [], review: [candidate] });
});

test('startup uploads a genuine offline edit only while its server revision still matches', async () => {
  const { createSyncCheckpoint, planStartupSync } = await import('../src/sync/localSyncStorage.js');
  const previous = { id: 'a', name: 'old' };
  const changed = { type: 'trip', recordID: 'a', payload: { id: 'a', name: 'edited offline' } };
  const checkpoint = await createSyncCheckpoint('user', base([['a', previous, 2]]));
  const result = await planStartupSync('user', checkpoint, [changed], [{ ...record('a', 2), payload: previous }]);
  assert.deepEqual(result, { changes: [{ ...changed, expectedRevision: 2 }], review: [] });
  const collision = await planStartupSync('user', checkpoint, [changed], [{ ...record('a', 3), payload: previous }]);
  assert.deepEqual(collision, { changes: [], review: [changed] });
  const otherAccount = await planStartupSync('other', checkpoint, [changed], [{ ...record('a', 2), payload: previous }]);
  assert.deepEqual(otherAccount, { changes: [], review: [changed] });
});

test('migration comparison accepts web display defaults and preserves real itinerary changes', async () => {
  const { comparableSyncPayload } = await import('../src/sync/localSyncStorage.js');
  const original = { id: 'a', name: 'old', itinerary: [{ day: 1, items: [] }] };
  const defaults = { ...original, updatedAt: 100, reserveItems: [], expenses: [], journalEntries: [], travelDetails: { flightNumber: '' }, settlementParticipants: [{ id: 'self', name: '나' }] };
  const remote = { user_id: 'user', record_type: 'trip', record_id: 'a', revision: 2, payload: original };
  const repository = createSyncV2Repository({
    supabase: { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, range: async () => ({ data: [remote] }) }), rpc() {} },
    queueStore: { put() {}, list() {}, remove() {} },
    comparablePayload: comparableSyncPayload
  });
  const legacyRow = value => ({ key: 'world_pro_trips_v1', value });
  const same = await repository.previewLegacyRows('user', [legacyRow([original]), legacyRow([defaults])]);
  assert.equal(same.conflicts.length, 0);
  assert.equal(same.identical.length, 1);
  const changed = { ...defaults, itinerary: [{ day: 1, items: [{ id: 'place', name: '새 장소' }] }] };
  assert.equal((await repository.previewLegacyRows('user', [legacyRow([changed])])).conflicts.length, 1);
});

test('device choice checks the revision seen during review and preserves queued deletions', async () => {
  const pending = new Map();
  let serverRevision = 5;
  let writes = 0;
  const repository = createSyncV2Repository({
    supabase: {
      from() {},
      async rpc(_name, params) {
        if (params.p_expected_revision !== serverRevision) return { data: { status: 'conflict' } };
        assert.ok(params.p_deleted_at);
        assert.equal(params.p_payload, null);
        writes += 1;
        return { data: { status: 'applied' } };
      }
    },
    queueStore: {
      async put(operation) { pending.set(operation.operationID, operation); },
      async list() { return [...pending.values()]; },
      async remove(id) { pending.delete(id); }
    }
  });
  const queuedDelete = {
    userID: 'user', operationID: '22222222-2222-4222-8222-222222222222', expectedRevision: 3,
    type: 'trip', recordID: 'a', deletedAt: '2026-11-18T01:00:00Z', payload: null
  };
  pending.set(queuedDelete.operationID, queuedDelete);
  const choices = [{ local: queuedDelete, pendingOperation: queuedDelete, remote: record('a', 4) }];
  const results = await repository.applyReviewedDeviceChoices('user', choices);
  assert.equal(results[0].result.status, 'conflict');
  assert.equal(writes, 0);
  assert.deepEqual([...pending.values()], [queuedDelete]);
  serverRevision = 4;
  assert.equal((await repository.applyReviewedDeviceChoices('user', choices))[0].result.status, 'applied');
  assert.equal(writes, 1);
  assert.equal(pending.size, 0);
});
