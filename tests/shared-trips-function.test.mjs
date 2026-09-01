import assert from 'node:assert/strict';
import test from 'node:test';

import {
  onRequest,
  onRequestGet,
  onRequestPatch,
  onRequestPost
} from '../functions/api/shared-trips.js';

const env = {
  VITE_SUPABASE_URL: 'https://project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SECRET_KEY: 'sb_secret_test-key'
};
const tripId = '123e4567-e89b-42d3-a456-426614174000';
const tripData = { id: 'local-trip', name: '테스트 여행', itinerary: [] };

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});

const makeRequest = (method, { id = '', body, token = '', origin = '' } = {}) => {
  const url = new URL('https://travelplaner.example/api/shared-trips');
  if (id) url.searchParams.set('id', id);
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
};

test('rejects a malformed shared id before querying Supabase', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse([]);
  };
  try {
    const response = await onRequestGet({ request: makeRequest('GET', { id: 'not-a-uuid' }), env });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loads only the exact shared trip and keeps sb_secret out of Authorization', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (input, options = {}) => {
    captured = { url: new URL(String(input)), options };
    return jsonResponse([{ id: tripId, trip_data: tripData, updated_at: '2026-09-01T00:00:00Z' }]);
  };
  try {
    const response = await onRequestGet({ request: makeRequest('GET', { id: tripId }), env });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).trip.id, tripId);
    assert.equal(captured.url.searchParams.get('id'), `eq.${tripId}`);
    assert.equal(captured.url.searchParams.get('limit'), '1');
    assert.equal(captured.options.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(captured.options.headers.authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('creates an anonymous shared trip with a null owner', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    calls.push({ url: new URL(String(input)), options });
    return jsonResponse([{ id: tripId, trip_data: tripData, updated_at: null }]);
  };
  try {
    const response = await onRequestPost({
      request: makeRequest('POST', { body: { trip_data: tripData }, origin: 'https://travelplaner.example' }),
      env
    });
    assert.equal(response.status, 201);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { trip_data: tripData, owner_id: null });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('verifies a supplied session and assigns the authenticated owner', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return jsonResponse({ id: 'user-123' });
    return jsonResponse([{ id: tripId, trip_data: tripData, updated_at: null }]);
  };
  try {
    const response = await onRequestPost({
      request: makeRequest('POST', { body: { trip_data: tripData }, token: 'valid-token' }),
      env
    });
    assert.equal(response.status, 201);
    assert.equal(calls[0].options.headers.authorization, 'Bearer valid-token');
    assert.deepEqual(JSON.parse(calls[1].options.body), { trip_data: tripData, owner_id: 'user-123' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects an invalid supplied session instead of creating anonymously', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse({ message: 'expired' }, 401);
  };
  try {
    const response = await onRequestPost({
      request: makeRequest('POST', { body: { trip_data: tripData }, token: 'expired-token' }),
      env
    });
    assert.equal(response.status, 401);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('patches only trip_data for the exact shared id', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (input, options = {}) => {
    captured = { url: new URL(String(input)), options };
    return jsonResponse([{ id: tripId, trip_data: tripData, updated_at: '2026-09-01T00:00:00Z' }]);
  };
  try {
    const response = await onRequestPatch({
      request: makeRequest('PATCH', { id: tripId, body: { trip_data: tripData } }),
      env
    });
    assert.equal(response.status, 200);
    assert.equal(captured.url.searchParams.get('id'), `eq.${tripId}`);
    assert.deepEqual(JSON.parse(captured.options.body), { trip_data: tripData });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects malformed and oversized request bodies', async () => {
  const malformed = await onRequestPost({ request: makeRequest('POST', { body: '{' }), env });
  assert.equal(malformed.status, 400);

  const oversized = await onRequestPost({
    request: makeRequest('POST', { body: { trip_data: { text: 'x'.repeat(1024 * 1024) } } }),
    env
  });
  assert.equal(oversized.status, 413);
});

test('rejects cross-origin writes', async () => {
  const response = await onRequestPost({
    request: makeRequest('POST', {
      body: { trip_data: tripData },
      origin: 'https://attacker.example'
    }),
    env
  });
  assert.equal(response.status, 403);
});

test('returns 404 when the exact shared trip does not exist', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([]);
  try {
    const response = await onRequestGet({ request: makeRequest('GET', { id: tripId }), env });
    assert.equal(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('allows only GET, POST, and PATCH on the endpoint', async () => {
  const response = await onRequest({ request: makeRequest('DELETE') });
  assert.equal(response.status, 405);
});
