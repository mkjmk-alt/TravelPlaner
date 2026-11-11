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
    if (url.pathname.startsWith('/rest/v1/')) return new Response(null, { status: 204 });
    if (url.pathname === '/storage/v1/object/list/trip-media') {
      return jsonResponse([{ name: 'media-1.jpg', id: 'object-1', metadata: { mimetype: 'image/jpeg' } }]);
    }
    if (url.pathname === '/storage/v1/object/trip-media') return jsonResponse({});
    if (url.pathname === '/auth/v1/admin/users/user-123') return jsonResponse({});
    return jsonResponse({ message: 'unexpected request' }, 500);
  };

  try {
    const response = await onRequestDelete({ request: makeRequest(), env });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
    assert.equal(calls.length, 8);

    assert.equal(calls[0].url.pathname, '/auth/v1/user');
    assert.equal(calls[0].options.headers.authorization, 'Bearer valid-token');
    assert.equal(calls[1].url.searchParams.get('owner_id'), 'eq.user-123');
    assert.equal(calls[1].options.method, 'DELETE');
    assert.equal(calls[2].url.searchParams.get('user_id'), 'eq.user-123');
    assert.equal(calls[3].url.searchParams.get('user_id'), 'eq.user-123');
    assert.equal(calls[4].url.searchParams.get('user_id'), 'eq.user-123');
    assert.equal(calls[6].url.pathname, '/storage/v1/object/trip-media');
    assert.deepEqual(JSON.parse(calls[6].options.body), { prefixes: ['user-123/media-1.jpg'] });
    assert.equal(calls[7].url.pathname, '/auth/v1/admin/users/user-123');
    assert.equal(calls[7].options.headers.apikey, 'sb_secret_test-key');
    assert.equal(calls[7].options.headers.authorization, undefined);
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

test('cleans only the authenticated account sync rows and media prefix before Auth deletion', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return jsonResponse({ id: 'user-123' });
    if (url.pathname.startsWith('/rest/v1/')) return new Response(null, { status: 204 });
    if (url.pathname === '/storage/v1/object/list/trip-media') {
      const { prefix, offset } = JSON.parse(options.body);
      assert.equal(prefix, 'user-123');
      assert.equal(offset, 0);
      return jsonResponse([
        { name: 'one.jpg', id: 'object-1', metadata: { mimetype: 'image/jpeg' } },
        { name: 'two.jpg', id: 'object-2', metadata: { mimetype: 'image/jpeg' } }
      ]);
    }
    if (url.pathname === '/storage/v1/object/trip-media') return jsonResponse({});
    if (url.pathname === '/auth/v1/admin/users/user-123') return jsonResponse({});
    return jsonResponse({ message: 'unexpected request' }, 500);
  };

  try {
    const response = await onRequestDelete({ request: makeRequest(), env });
    assert.equal(response.status, 200);
    const syncDeletes = calls.filter(({ url }) => url.pathname === '/rest/v1/user_sync_records'
      || url.pathname === '/rest/v1/sync_operation_receipts');
    assert.equal(syncDeletes.length, 2);
    for (const { url, options } of syncDeletes) {
      assert.equal(url.searchParams.get('user_id'), 'eq.user-123');
      assert.equal(options.method, 'DELETE');
      assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
    }
    const mediaDelete = calls.find(({ url }) => url.pathname === '/storage/v1/object/trip-media');
    assert.deepEqual(JSON.parse(mediaDelete.options.body), {
      prefixes: ['user-123/one.jpg', 'user-123/two.jpg']
    });
    assert.equal(calls.at(-1).url.pathname, '/auth/v1/admin/users/user-123');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('removes large personal media sets in Storage API batches of at most 1000 objects', async () => {
  const originalFetch = globalThis.fetch;
  const batches = [];
  let authDeleted = false;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return jsonResponse({ id: 'user-123' });
    if (url.pathname.startsWith('/rest/v1/')) return new Response(null, { status: 204 });
    if (url.pathname === '/storage/v1/object/list/trip-media') {
      const { offset, limit } = JSON.parse(options.body);
      assert.equal(limit, 1000);
      if (offset === 0) {
        return jsonResponse(Array.from({ length: 1000 }, (_, index) => ({
          name: `photo-${String(index).padStart(4, '0')}.jpg`,
          id: `object-${index}`,
          metadata: { mimetype: 'image/jpeg' }
        })));
      }
      return jsonResponse([{ name: 'photo-1000.jpg', id: 'object-1000', metadata: { mimetype: 'image/jpeg' } }]);
    }
    if (url.pathname === '/storage/v1/object/trip-media') {
      const paths = JSON.parse(options.body).prefixes;
      batches.push(paths);
      return jsonResponse({});
    }
    if (url.pathname === '/auth/v1/admin/users/user-123') {
      authDeleted = true;
      return jsonResponse({});
    }
    return jsonResponse({ message: 'unexpected request' }, 500);
  };

  try {
    const response = await onRequestDelete({ request: makeRequest(), env });
    assert.equal(response.status, 200);
    assert.deepEqual(batches.map(batch => batch.length), [1000, 1]);
    assert.equal(batches.flat().length, 1001);
    assert.ok(batches.flat().every(path => path.startsWith('user-123/')));
    assert.equal(authDeleted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not remove the Auth account when personal media cleanup fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const calls = [];
  console.error = () => undefined;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === '/auth/v1/user') return jsonResponse({ id: 'user-123' });
    if (url.pathname.startsWith('/rest/v1/')) return new Response(null, { status: 204 });
    if (url.pathname === '/storage/v1/object/list/trip-media') return jsonResponse({ message: 'storage unavailable' }, 503);
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
    if (url.pathname === '/storage/v1/object/list/trip-media') return jsonResponse([]);
    if (url.pathname === '/storage/v1/object/trip-media') return jsonResponse({});
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
