import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRealtimeListener, ACCOUNT_REFRESH_FALLBACK_MS } from '../src/sync/accountRealtime.js';

test('account change notifications are scoped and stopped without trusting the payload', () => {
  const calls = []; let callback; let status;
  const channel = {
    on(type, filter, handler) { calls.push([type, filter]); callback = handler; return this; },
    subscribe(handler) { status = handler; return this; }
  };
  const client = { channel(name) { calls.push(['channel', name]); return channel; }, removeChannel(value) { calls.push(['remove', value]); } };
  let changes = 0; let connected = 0;
  const stop = createAccountRealtimeListener({ supabase: client, userID: 'account-1', onChange: () => changes++, onConnected: () => connected++ });
  assert.deepEqual(calls[1], ['postgres_changes', { event: '*', schema: 'public', table: 'user_sync_records', filter: 'user_id=eq.account-1' }]);
  callback({ new: { user_id: 'other', payload: 'untrusted' } });
  status('SUBSCRIBED');
  assert.equal(changes, 1); assert.equal(connected, 1);
  stop(); callback({}); status('SUBSCRIBED');
  assert.equal(changes, 1); assert.equal(connected, 1);
  assert.equal(calls.at(-1)[0], 'remove');
});

test('fallback is slower but remains bounded when events are missed', () => {
  assert.equal(ACCOUNT_REFRESH_FALLBACK_MS, 60_000);
});

test('a full refresh is skipped only for matching verified fingerprints and no pending edits', async () => {
  const { canSkipFullRefresh, confirmedFingerprint } = await import('../src/sync/accountRealtime.js');
  assert.equal(canSkipFullRefresh('abc', 'abc', 0), true);
  assert.equal(canSkipFullRefresh('abc', 'abc', 1), false);
  assert.equal(canSkipFullRefresh('abc', 'xyz', 0), false);
  assert.equal(canSkipFullRefresh(null, null, 0), false);
  assert.equal(confirmedFingerprint('abc', 'abc'), 'abc');
  assert.equal(confirmedFingerprint('abc', 'xyz'), null);
  assert.equal(confirmedFingerprint(null, null), null);
});

test('a snapshot changing during pagination is never applied', async () => {
  const { canApplySnapshot } = await import('../src/sync/accountRealtime.js');
  assert.equal(canApplySnapshot('a', 'b'), false);
  assert.equal(canApplySnapshot('a', null), false);
  assert.equal(canApplySnapshot(null, 'a'), false);
  assert.equal(canApplySnapshot('a', 'a'), true);
  assert.equal(canApplySnapshot(null, null), true); // backward compatible before migration
});

test('legacy servers retain frequent reconciliation until the fingerprint RPC is available', async () => {
  const { fallbackInterval } = await import('../src/sync/accountRealtime.js');
  assert.equal(fallbackInterval(false), 10_000);
  assert.equal(fallbackInterval(true), 60_000);
});

test('delta response merges changed rows and rejects foreign-account records', async () => {
  const { mergeAccountDelta } = await import('../src/sync/accountRealtime.js');
  const local = [{ userID: 'a', type: 'trip', recordID: '1', revision: 1, payload: { name: 'old' } }, { userID: 'a', type: 'savedPlace', recordID: '2', revision: 1 }];
  const changed = [{ userID: 'a', type: 'trip', recordID: '1', revision: 2, payload: { name: 'new' } }];
  assert.deepEqual(mergeAccountDelta('a', local, changed), [changed[0], local[1]]);
  assert.equal(mergeAccountDelta('a', local, [{ ...changed[0], userID: 'b' }]), null);
  assert.equal(mergeAccountDelta('a', local, [{ ...changed[0], revision: 0 }]), null);
});

test('realtime disconnection is reported so clients can keep the faster fallback', () => {
  let status; let disconnected = 0;
  const channel = { on() { return this; }, subscribe(fn) { status = fn; return this; } };
  const stop = createAccountRealtimeListener({ supabase: { channel: () => channel, removeChannel() {} }, userID: 'a', onChange() {}, onConnected() {}, onDisconnected: () => disconnected++ });
  status('CHANNEL_ERROR'); status('TIMED_OUT');
  assert.equal(disconnected, 2);
  stop(); status('CLOSED'); assert.equal(disconnected, 2);
});

test('repository requests account-scoped metadata and preserves tombstones in delta', async () => {
  const { createSyncV2Repository } = await import('../src/sync/syncV2Repository.js');
  let received;
  const supabase = { from() {}, async rpc(name, params) {
    if (name === 'account_sync_fingerprint') return { data: 'fingerprint', error: null };
    received = { name, params };
    return { data: { requires_full: false, records: [{ user_id: 'a', record_type: 'trip', record_id: '1', revision: 3, deleted_at: '2026-01-01T00:00:00Z', payload: null }] }, error: null };
  } };
  const queueStore = { async put() {}, async list() { return []; }, async remove() {} };
  const repo = createSyncV2Repository({ supabase, queueStore });
  assert.equal(await repo.fingerprint(), 'fingerprint');
  const delta = await repo.listChanges('a', [{ userID: 'a', type: 'trip', recordID: '1', revision: 2 }]);
  assert.deepEqual(received, { name: 'account_sync_delta', params: { p_known: [{ record_type: 'trip', record_id: '1', revision: 2, deleted: false }] } });
  assert.equal(delta.records[0].deletedAt, '2026-01-01T00:00:00Z');
  assert.equal(delta.records[0].payload, null);
});

test('missing server RPCs gracefully fall back to the legacy full refresh', async () => {
  const { createSyncV2Repository } = await import('../src/sync/syncV2Repository.js');
  const supabase = { from() {}, async rpc() { return { data: null, error: { code: 'PGRST202' } }; } };
  const repo = createSyncV2Repository({ supabase, queueStore: { async put() {}, async list() { return []; }, async remove() {} } });
  assert.equal(await repo.fingerprint(), null);
  assert.equal(await repo.listChanges('a', []), null);
});
