import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestDelete, onRequestPatch } from '../functions/api/shared-trips.js';

const env = {
  VITE_SUPABASE_URL: 'https://project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SECRET_KEY: 'sb_secret_test-key'
};
const tripId = '123e4567-e89b-42d3-a456-426614174000';
const operationId = '123e4567-e89b-42d3-a456-426614174001';
const managementToken = 'creator-only-management-token';
const tripData = { id: 'local-trip', name: 'Rome', itinerary: [{ day: 1 }] };

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});

const makeRequest = ({ token = managementToken, body = {} } = {}) => new Request(
  `https://travelplaner.example/api/shared-trips?id=${tripId}`,
  {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-travelplaner-management-token': token } : {})
    },
    body: JSON.stringify(body)
  }
);

const makeDeleteRequest = ({ token = managementToken, body = {} } = {}) => new Request(
  `https://travelplaner.example/api/shared-trips?id=${tripId}`,
  {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-travelplaner-management-token': token } : {})
    },
    body: JSON.stringify(body)
  }
);

const hashToken = async (token) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

test('shared v2 update checks manager credentials and forwards the caller revision and operation ID to the atomic RPC', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/rest/v1/shared_trips') {
      return jsonResponse([{
        id: tripId,
        owner_id: null,
        management_token_hash: await hashToken(managementToken),
        revision: 4,
        deleted_at: null
      }]);
    }
    if (url.pathname === '/rest/v1/rpc/apply_shared_trip_operation') {
      return jsonResponse({
        status: 'applied',
        trip: { id: tripId, trip_data: tripData, revision: 5, deleted_at: null }
      });
    }
    return jsonResponse({ message: 'unexpected request' }, 500);
  };

  try {
    const response = await onRequestPatch({
      request: makeRequest({
        body: { trip_data: tripData, expected_revision: 4, operation_id: operationId }
      }),
      env
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).trip.revision, 5);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url.searchParams.get('select'), 'id,owner_id,management_token_hash,revision,deleted_at');
    assert.equal(calls[1].url.pathname, '/rest/v1/rpc/apply_shared_trip_operation');
    assert.equal(calls[1].options.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(calls[1].options.headers.authorization, undefined);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      p_trip_id: tripId,
      p_expected_revision: 4,
      p_operation_id: operationId,
      p_operation_type: 'update',
      p_trip_data: tripData
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shared v2 update rejects missing or invalid manager credentials before invoking the RPC', async () => {
  const originalFetch = globalThis.fetch;
  let rpcCalled = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/shared_trips') {
      return jsonResponse([{
        id: tripId,
        owner_id: null,
        management_token_hash: await hashToken(managementToken),
        revision: 4,
        deleted_at: null
      }]);
    }
    rpcCalled = true;
    return jsonResponse({ status: 'applied' });
  };
  try {
    for (const token of ['', 'not-the-owner-token']) {
      const response = await onRequestPatch({
        request: makeRequest({ token, body: { trip_data: tripData, expected_revision: 4, operation_id: operationId } }),
        env
      });
      assert.equal(response.status, 403);
    }
    assert.equal(rpcCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shared v2 stale revision returns the current trip as a conflict without treating it as a saved update', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/shared_trips') {
      return jsonResponse([{
        id: tripId,
        owner_id: null,
        management_token_hash: await hashToken(managementToken),
        revision: 5,
        deleted_at: null
      }]);
    }
    return jsonResponse({
      status: 'conflict',
      trip: { id: tripId, trip_data: { id: 'remote', name: 'Current server copy' }, revision: 5 }
    });
  };
  try {
    const response = await onRequestPatch({
      request: makeRequest({
        body: { trip_data: tripData, expected_revision: 4, operation_id: operationId }
      }),
      env
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      status: 'conflict',
      trip: { id: tripId, trip_data: { id: 'remote', name: 'Current server copy' }, revision: 5 }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shared v2 operation requires both a positive expected revision and a valid UUID', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse([]);
  };
  try {
    for (const body of [
      { trip_data: tripData, expected_revision: 4 },
      { trip_data: tripData, expected_revision: -1, operation_id: operationId },
      { trip_data: tripData, expected_revision: 4, operation_id: 'not-a-uuid' }
    ]) {
      const response = await onRequestPatch({ request: makeRequest({ body }), env });
      assert.equal(response.status, 400);
    }
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shared v2 deletion writes a revisioned tombstone through the same idempotent server RPC', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/rest/v1/shared_trips') {
      return jsonResponse([{
        id: tripId,
        owner_id: null,
        management_token_hash: await hashToken(managementToken),
        revision: 7,
        deleted_at: null
      }]);
    }
    return jsonResponse({
      status: 'applied',
      trip: { id: tripId, trip_data: tripData, revision: 8, deleted_at: '2026-10-14T00:00:00Z' }
    });
  };
  try {
    const response = await onRequestDelete({
      request: makeDeleteRequest({
        body: { expected_revision: 7, operation_id: operationId }
      }),
      env
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true, id: tripId, revision: 8, status: 'applied' });
    const rpc = calls.find(({ url }) => url.pathname === '/rest/v1/rpc/apply_shared_trip_operation');
    assert.ok(rpc);
    assert.deepEqual(JSON.parse(rpc.options.body), {
      p_trip_id: tripId,
      p_expected_revision: 7,
      p_operation_id: operationId,
      p_operation_type: 'delete',
      p_trip_data: null
    });
    assert.equal(calls[0].url.searchParams.get('deleted_at'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
