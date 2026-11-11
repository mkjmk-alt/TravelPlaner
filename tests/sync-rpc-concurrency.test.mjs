import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.TRIPPLOT_SYNC_TEST_URL;
const anonKey = process.env.TRIPPLOT_SYNC_TEST_ANON_KEY;
const isLocalSupabase = (() => {
  if (!supabaseUrl) return false;
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(supabaseUrl).hostname);
  } catch {
    return false;
  }
})();
const canRunIntegration = Boolean(supabaseUrl && anonKey && isLocalSupabase);

const requestJson = async (path, { method = 'GET', token = '', body } = {}) => {
  const response = await fetch(new URL(path, supabaseUrl), {
    method,
    headers: {
      apikey: anonKey,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
};

const createTestSession = async () => {
  const email = `sync-${randomUUID()}@example.test`;
  const { response, payload } = await requestJson('/auth/v1/signup', {
    method: 'POST',
    body: { email, password: `${randomUUID()}Aa1!` }
  });
  assert.equal(response.ok, true, `local Supabase signup failed: ${JSON.stringify(payload)}`);
  assert.equal(typeof payload?.access_token, 'string', 'local Supabase must return a confirmed test session');
  return payload.access_token;
};

test('same-revision simultaneous sync writes apply exactly one and preserve the losing payload as a conflict', {
  skip: !canRunIntegration && 'Set TRIPPLOT_SYNC_TEST_URL and TRIPPLOT_SYNC_TEST_ANON_KEY to a local Supabase URL to run this integration test.'
}, async () => {
  const token = await createTestSession();
  const recordId = `concurrent-${randomUUID()}`;
  const common = {
    p_record_type: 'trip',
    p_record_id: recordId,
    p_expected_revision: 0,
    p_deleted_at: null
  };
  const firstOperation = {
    ...common,
    p_operation_id: randomUUID(),
    p_payload: { id: recordId, name: 'writer one', itinerary: [{ day: 1 }] }
  };
  const secondOperation = {
    ...common,
    p_operation_id: randomUUID(),
    p_payload: { id: recordId, name: 'writer two', itinerary: [{ day: 2 }] }
  };

  const results = await Promise.all([
    requestJson('/rest/v1/rpc/apply_user_sync_operation', { method: 'POST', token, body: firstOperation }),
    requestJson('/rest/v1/rpc/apply_user_sync_operation', { method: 'POST', token, body: secondOperation })
  ]);

  assert.deepEqual(results.map(({ response }) => response.status).sort(), [200, 200]);
  assert.deepEqual(results.map(({ payload }) => payload.status).sort(), ['applied', 'conflict']);
  const conflict = results.find(({ payload }) => payload.status === 'conflict');
  assert.equal(conflict.payload.record.revision, 1);
  assert.ok(['writer one', 'writer two'].includes(conflict.payload.record.payload.name));
});

test('an operation replay is idempotent and reusing its ID for a different body is rejected', {
  skip: !canRunIntegration && 'Set TRIPPLOT_SYNC_TEST_URL and TRIPPLOT_SYNC_TEST_ANON_KEY to a local Supabase URL to run this integration test.'
}, async () => {
  const token = await createTestSession();
  const recordId = `replay-${randomUUID()}`;
  const operation = {
    p_record_type: 'savedPlace',
    p_record_id: recordId,
    p_expected_revision: 0,
    p_operation_id: randomUUID(),
    p_payload: { id: recordId, name: 'Trevi Fountain' },
    p_deleted_at: null
  };

  const first = await requestJson('/rest/v1/rpc/apply_user_sync_operation', { method: 'POST', token, body: operation });
  const replay = await requestJson('/rest/v1/rpc/apply_user_sync_operation', { method: 'POST', token, body: operation });
  const altered = await requestJson('/rest/v1/rpc/apply_user_sync_operation', {
    method: 'POST',
    token,
    body: { ...operation, p_payload: { id: recordId, name: 'Altered place' } }
  });

  assert.equal(first.response.status, 200);
  assert.equal(first.payload.status, 'applied');
  assert.equal(replay.response.status, 200);
  assert.equal(replay.payload.status, 'replayed');
  assert.deepEqual(replay.payload.record, first.payload.record);
  assert.equal(altered.response.ok, false);
});
