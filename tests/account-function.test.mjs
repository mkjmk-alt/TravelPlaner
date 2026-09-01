import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest, onRequestDelete } from '../functions/api/account.js';

const env = {
  VITE_SUPABASE_URL: 'https://project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SECRET_KEY: 'sb_secret_test-key'
};

const makeRequest = (token = 'valid-token') => new Request('https://travelplaner.example/api/account', {
  method: 'DELETE',
  headers: token ? { authorization: `Bearer ${token}` } : {}
});

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});

test('rejects requests without a bearer token', async () => {
  const response = await onRequestDelete({ request: makeRequest(''), env });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.message, '로그인이 필요합니다.');
});

test('returns a setup error when the server secret is missing', async () => {
  const response = await onRequestDelete({
    request: makeRequest(),
    env: { VITE_SUPABASE_URL: env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY }
  });
  assert.equal(response.status, 503);
});

test('rejects an expired Supabase session', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ message: 'expired' }, 401);
  try {
    const response = await onRequestDelete({ request: makeRequest('expired-token'), env });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.message, '로그인 세션이 만료되었습니다.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deletes only rows owned by the authenticated user before deleting auth', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });

    if (url.pathname === '/auth/v1/user') return jsonResponse({ id: 'user-123' });
    if (url.pathname === '/rest/v1/shared_trips') return new Response(null, { status: 204 });
    if (url.pathname === '/rest/v1/user_state') return new Response(null, { status: 204 });
    if (url.pathname === '/auth/v1/admin/users/user-123') return jsonResponse({});
    return jsonResponse({ message: 'unexpected request' }, 500);
  };

  try {
    const response = await onRequestDelete({ request: makeRequest(), env });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
    assert.equal(calls.length, 4);

    assert.equal(calls[0].url.pathname, '/auth/v1/user');
    assert.equal(calls[0].options.headers.authorization, 'Bearer valid-token');
    assert.equal(calls[1].url.searchParams.get('owner_id'), 'eq.user-123');
    assert.equal(calls[1].options.method, 'DELETE');
    assert.equal(calls[2].url.searchParams.get('user_id'), 'eq.user-123');
    assert.equal(calls[3].url.pathname, '/auth/v1/admin/users/user-123');
    assert.equal(calls[3].options.headers.apikey, 'sb_secret_test-key');
    assert.equal(calls[3].options.headers.authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not delete the auth account after a database deletion failure', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const originalConsoleError = console.error;
  console.error = () => undefined;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') return jsonResponse({ id: 'user-123' });
    if (url.pathname === '/rest/v1/shared_trips') return jsonResponse({ message: 'database error' }, 500);
    return jsonResponse({});
  };

  try {
    const response = await onRequestDelete({ request: makeRequest(), env });
    assert.equal(response.status, 502);
    assert.equal(calls.includes('/auth/v1/admin/users/user-123'), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test('allows only DELETE on the account endpoint', async () => {
  const response = await onRequest({ request: new Request('https://travelplaner.example/api/account') });
  assert.equal(response.status, 405);
});

test('keeps legacy service_role bearer compatibility', async () => {
  const originalFetch = globalThis.fetch;
  const adminCalls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return jsonResponse({ id: 'user-123' });
    if (url.pathname.startsWith('/rest/v1/')) return new Response(null, { status: 204 });
    adminCalls.push(options.headers);
    return jsonResponse({});
  };

  try {
    const response = await onRequestDelete({
      request: makeRequest(),
      env: {
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role-jwt'
      }
    });
    assert.equal(response.status, 200);
    assert.equal(adminCalls[0].authorization, 'Bearer legacy-service-role-jwt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
