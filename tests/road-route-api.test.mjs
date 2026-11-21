import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRoadRoutes } from '../functions/api/road-routes.js';

const owner = '29fb786a-bcb9-48bd-8a52-07b45d24aea9';
const other = 'fdd9f752-52ef-4382-98c2-e29026a9ab2f';
const env = {
  VITE_SUPABASE_URL: 'https://example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  TRIPPLOT_ROUTES_SERVER_KEY: 'test-key',
  TRIPPLOT_PURCHASE_TEST_USER_ID: owner
};
const segment = { origin: { lat: 43, lng: 141 }, destination: { lat: 44, lng: 142 }, travelMode: 'DRIVING' };

async function request({ method = 'POST', body = segment, user = owner, token = 'session', decision = { allowed: true }, config = env } = {}) {
  const calls = [];
  const response = await handleRoadRoutes({
    request: new Request('https://tripplot.test/api/road-routes', {
      method, headers: token ? { authorization: `Bearer ${token}` } : {},
      body: ['POST', 'PATCH'].includes(method) ? JSON.stringify(body) : undefined
    }),
    env: config
  }, async (url, init) => {
    calls.push({ url: String(url), init });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: user });
    if (url.pathname === '/rest/v1/rpc/tripplot_road_route_usage') return Response.json(decision);
    return Response.json({ routes: [{ polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } }] });
  });
  return { status: response.status, data: await response.json(), calls };
}

test('authentication, valid coordinates and initialized quota are required before Google', async () => {
  assert.equal((await request({ token: '' })).status, 401);
  assert.equal((await request({ body: { ...segment, origin: { lat: 91, lng: 0 } } })).status, 400);
  const { status, calls } = await request({ decision: null });
  assert.equal(status, 503);
  assert.equal(calls.length, 2);
});

test('account and service quotas stop the billable request', async () => {
  for (const code of ['ACCOUNT_LIMIT', 'SERVICE_LIMIT']) {
    const { status, data, calls } = await request({ decision: { allowed: false, code } });
    assert.equal(status, 429);
    assert.equal(data.code, code);
    assert.equal(calls.length, 2);
  }
});

test('only the configured account can change purchase simulation', async () => {
  const denied = await request({ method: 'PATCH', body: { plan: 'pro' }, user: other });
  assert.equal(denied.status, 403);
  assert.equal(denied.calls.length, 1);
  const accepted = await request({ method: 'PATCH', body: { plan: 'pro' } });
  assert.equal(accepted.status, 200);
  const args = JSON.parse(accepted.calls[1].init.body);
  assert.equal(args.p_user_id, owner);
  assert.equal(args.p_test_plan, 'pro');
});

test('reserved segments use the server key and return a decoded path', async () => {
  const { status, data, calls } = await request();
  assert.equal(status, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].init.headers['X-Goog-Api-Key'], env.TRIPPLOT_ROUTES_SERVER_KEY);
  assert.deepEqual(data.path[0], { lat: 38.5, lng: -120.2 });
});

test('purchase simulation can be checked before a billing key is configured', async () => {
  const config = { ...env, TRIPPLOT_ROUTES_SERVER_KEY: '' };
  const status = await request({ method: 'GET', config });
  assert.equal(status.status, 200);
  assert.equal(status.calls.length, 2);
  const blocked = await request({ config });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.calls.length, 0);
});
