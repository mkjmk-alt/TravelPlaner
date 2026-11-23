import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFlightStatus } from '../functions/api/flight-status.js';

const userId = '29fb786a-bcb9-48bd-8a52-07b45d24aea9';
const env = {
  VITE_SUPABASE_URL: 'https://supabase.example.test',
  VITE_SUPABASE_ANON_KEY: 'test-anon',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  TRIPPLOT_FLIGHTAWARE_API_KEY: 'test-aeroapi',
  TRIPPLOT_FLIGHT_STATUS_ACCOUNT_MONTHLY_LIMIT: '10',
  TRIPPLOT_FLIGHT_STATUS_GLOBAL_MONTHLY_LIMIT: '100'
};
const now = Date.parse('2026-11-28T00:00:00Z');
const flight = {
  ident: 'KAL765', ident_icao: 'KAL765', ident_iata: 'KE765', type: 'Airline',
  fa_flight_id: 'flight-one', origin: { timezone: 'Asia/Seoul' }, status: 'Scheduled',
  scheduled_out: '2026-11-27T17:00:00Z', estimated_out: '2026-11-28T02:05:00+09:00',
  actual_out: null, scheduled_in: '2026-11-27T20:00:00Z', estimated_in: null, actual_in: null,
  gate_origin: '24', gate_destination: null, cancelled: false, diverted: false
};

async function lookup({
  query = 'number=KE765&date=2026-11-28', method = 'GET', authorization = 'Bearer session',
  config = env, clock = now, userStatus = 200, user = userId, quotaStatus = 200,
  decision = { allowed: true }, providerStatus = 200, flights = [flight], links = null,
  providerFailure = false
} = {}) {
  const calls = [];
  const response = await handleFlightStatus({
    request: new Request(`https://tripplot.test/api/flight-status?${query}`, {
      method, headers: { authorization }
    }),
    env: config
  }, async (url, init) => {
    calls.push({ url, ...init });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: user }, { status: userStatus });
    if (url.pathname === '/rest/v1/rpc/tripplot_reserve_flight_status') {
      return Response.json(decision, { status: quotaStatus });
    }
    if (providerFailure) throw new DOMException('Mock timeout', 'TimeoutError');
    return Response.json({ flights, links, num_pages: 1 }, { status: providerStatus });
  }, () => clock);
  return { status: response.status, body: await response.json(), headers: response.headers, calls };
}

test('rejects retired registration requests before reserving quota or calling the provider', async () => {
  for (const date of ['2026-11-28', '2026-12-20']) {
    const result = await lookup({ query: `number=KE765&date=${date}&purpose=registration` });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'INVALID_ARGUMENT');
    assert.deepEqual(result.calls.map(call => call.url.pathname), ['/auth/v1/user']);
  }
});

test('verifies the Supabase session, reserves one billable result set, and maps the exact local-date flight', async () => {
  const { status, body, headers, calls } = await lookup({
    query: 'number=%20ke765%20&date=2026-11-28',
    flights: [
      { ...flight, ident: 'KAL7650', ident_icao: 'KAL7650', ident_iata: 'KE7650' },
      { ...flight, scheduled_out: '2026-11-28T16:00:00Z' },
      flight
    ]
  });
  assert.equal(status, 200);
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.deepEqual(body, {
    number: 'KE765', date: '2026-11-28', status: 'Scheduled',
    scheduledDeparture: '2026-11-27T17:00:00.000Z', estimatedDeparture: '2026-11-27T17:05:00.000Z',
    actualDeparture: null, scheduledArrival: '2026-11-27T20:00:00.000Z', estimatedArrival: null,
    actualArrival: null, departureGate: '24', arrivalGate: null, cancelled: false, diverted: false,
    updatedAt: '2026-11-28T00:00:00.000Z'
  });
  assert.equal(calls.length, 3);
  const [auth, quota, provider] = calls;
  assert.equal(auth.url.href, 'https://supabase.example.test/auth/v1/user');
  assert.deepEqual(auth.headers, { apikey: 'test-anon', authorization: 'Bearer session' });
  assert.equal(quota.url.href, 'https://supabase.example.test/rest/v1/rpc/tripplot_reserve_flight_status');
  assert.equal(quota.method, 'POST');
  assert.equal(quota.headers.apikey, env.SUPABASE_SECRET_KEY);
  assert.equal(quota.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(quota.body), {
    p_user_id: userId, p_number: 'KE765', p_date: '2026-11-28', p_account_limit: 10, p_global_limit: 100
  });
  assert.equal(provider.url.origin + provider.url.pathname, 'https://aeroapi.flightaware.com/aeroapi/flights/KE765');
  assert.deepEqual(Object.fromEntries(provider.url.searchParams), {
    ident_type: 'designator', start: '2026-11-27T10:00:00.000Z', end: '2026-11-29T12:00:00.000Z', max_pages: '1'
  });
  assert.deepEqual(provider.headers, { 'x-apikey': env.TRIPPLOT_FLIGHTAWARE_API_KEY });
  assert.ok(calls.every(call => call.redirect === 'error' && call.signal instanceof AbortSignal));
});

test('enforces GET and rejects missing, invalid, or unverified Supabase sessions', async () => {
  const cases = [
    [{ method: 'POST' }, 405, 'METHOD_NOT_ALLOWED', 0],
    [{ authorization: 'Basic abc' }, 401, 'LOGIN_REQUIRED', 0],
    [{ authorization: '' }, 401, 'LOGIN_REQUIRED', 0],
    [{ userStatus: 401 }, 401, 'LOGIN_REQUIRED', 1],
    [{ user: 'invalid' }, 401, 'LOGIN_REQUIRED', 1],
    [{ userStatus: 502 }, 503, 'UNAVAILABLE', 1]
  ];
  for (const [options, status, code, callCount] of cases) {
    const result = await lookup(options);
    assert.equal(result.status, status);
    assert.deepEqual(result.body, { code });
    assert.equal(result.calls.length, callCount);
  }
});

test('rejects malformed or out-of-window queries before reserving quota', async () => {
  for (const query of [
    '', 'number=KE765&date=2026-11-31', 'number=KE765&date=2026-11-28T00:00:00Z',
    'number=KE765%2F..&date=2026-11-28', 'number=KE765&number=KE766&date=2026-11-28',
    'number=KE765&date=2026-11-28&date=2026-11-29', 'number=777&date=2026-11-28',
    'number=KE765&date=2026-12-10', 'number=KE765&date=2026-11-10'
  ]) {
    const result = await lookup({ query });
    assert.equal(result.status, 400, query);
    assert.deepEqual(result.body, { code: 'INVALID_ARGUMENT' }, query);
    assert.equal(result.calls.length, 1, query);
  }
});

test('clamps queries near the documented AeroAPI bounds and uses scheduled runway time only to locate the date', async () => {
  const result = await lookup({
    query: 'number=KAL765&date=2026-11-29',
    flights: [{ ...flight, scheduled_out: null, scheduled_off: '2026-11-28T23:50:00Z', estimated_out: null }],
    config: { ...env, SUPABASE_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: 'legacy-test' }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.scheduledDeparture, null);
  assert.equal(result.calls[1].headers.authorization, 'Bearer legacy-test');
  const end = Date.parse(result.calls[2].url.searchParams.get('end'));
  assert.ok(end > now && end <= now + 2 * 86_400_000);
  const past = await lookup({ query: 'number=KE765&date=2026-11-18', flights: [] });
  assert.equal(past.status, 404);
  assert.ok(Date.parse(past.calls[2].url.searchParams.get('start')) >= now - 10 * 86_400_000);
});

test('uses the departure airport time zone with its daylight saving offset and recognizes exact codeshares', async () => {
  const result = await lookup({
    query: 'number=DL456&date=2026-07-30', clock: Date.parse('2026-07-31T00:00:00Z'),
    flights: [{ ...flight, codeshares_iata: ['DL456'], origin: { timezone: 'America/New_York' },
      scheduled_out: '2026-07-31T03:50:00Z', actual_out: '2026-07-31T04:30:00Z', cancelled: true }]
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.number, 'DL456');
  assert.equal(result.body.actualDeparture, '2026-07-31T04:30:00.000Z');
  assert.equal(result.body.cancelled, true);
});

test('requires a verifiable scheduled departure and keeps nullable arrival fields on the flat contract', async () => {
  const result = await lookup({ flights: [{ ...flight,
    estimated_in: '2026-11-28T05:10:00+09:00', actual_in: '2026-11-27T20:12:05Z',
    gate_destination: '5C', estimated_out: '2026-11-27T24:00:00Z'
  }] });
  assert.equal(result.status, 200);
  assert.equal(result.body.estimatedDeparture, null);
  assert.equal(result.body.estimatedArrival, '2026-11-27T20:10:00.000Z');
  assert.equal(result.body.actualArrival, '2026-11-27T20:12:05.000Z');
  assert.equal(result.body.arrivalGate, '5C');
  for (const fields of [
    { scheduled_out: null, actual_out: flight.scheduled_out },
    { scheduled_out: '2026-02-30T03:00:00Z' },
    { status: '' }, { cancelled: null }, { diverted: 'false' }
  ]) {
    const invalid = await lookup({ flights: [{ ...flight, ...fields }] });
    assert.equal(invalid.status, 503);
    assert.deepEqual(invalid.body, { code: 'UNAVAILABLE' });
  }
});

test('fails closed on missing server config, an unavailable quota RPC, and malformed quota decisions', async () => {
  for (const [key, value] of [
    ['TRIPPLOT_FLIGHTAWARE_API_KEY', ' '], ['SUPABASE_SECRET_KEY', ''],
    ['TRIPPLOT_FLIGHT_STATUS_ACCOUNT_MONTHLY_LIMIT', undefined],
    ['TRIPPLOT_FLIGHT_STATUS_GLOBAL_MONTHLY_LIMIT', ''], ['TRIPPLOT_FLIGHT_STATUS_GLOBAL_MONTHLY_LIMIT', '1e3'],
    ['TRIPPLOT_FLIGHT_STATUS_GLOBAL_MONTHLY_LIMIT', '0']
  ]) {
    const result = await lookup({ config: { ...env, [key]: value } });
    assert.equal(result.status, 503, key);
    assert.deepEqual(result.body, { code: 'UNAVAILABLE' });
    assert.ok(result.calls.length <= 1);
  }
  for (const options of [{ quotaStatus: 404 }, { decision: null }, { decision: { allowed: 'true' } }]) {
    const result = await lookup(options);
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { code: 'UNAVAILABLE' });
    assert.equal(result.calls.length, 2);
  }
});

test('account, global, and duplicate limits prevent any provider call', async () => {
  for (const reason of ['ACCOUNT_LIMIT', 'GLOBAL_LIMIT', 'DUPLICATE']) {
    const result = await lookup({ decision: { allowed: false, reason } });
    assert.equal(result.status, 429);
    assert.deepEqual(result.body, { code: 'RATE_LIMIT' });
    assert.equal(result.headers.get('retry-after'), reason === 'DUPLICATE' ? '30' : null);
    assert.equal(result.calls.length, 2);
  }
});

test('returns a stable error for upstream throttles, outages, and missing flights without retrying', async () => {
  const cases = [
    [{ providerStatus: 429 }, 429, 'RATE_LIMIT'], [{ providerStatus: 404 }, 404, 'NOT_FOUND'],
    [{ providerStatus: 400 }, 503, 'UNAVAILABLE'], [{ providerStatus: 401 }, 503, 'UNAVAILABLE'],
    [{ providerStatus: 500 }, 503, 'UNAVAILABLE'], [{ providerFailure: true }, 503, 'UNAVAILABLE'],
    [{ flights: [] }, 404, 'NOT_FOUND'], [{ flights: null }, 503, 'UNAVAILABLE'],
    [{ flights: [{ ...flight, ident_iata: 'KE766' }] }, 404, 'NOT_FOUND'],
    [{ flights: [{ ...flight, origin: { timezone: 'unknown' } }] }, 503, 'UNAVAILABLE'],
    [{ flights: [{ ...flight, blocked: true }] }, 404, 'NOT_FOUND']
  ];
  for (const [options, status, code] of cases) {
    const result = await lookup(options);
    assert.equal(result.status, status);
    assert.deepEqual(result.body, { code });
    assert.equal(result.calls.length, 3);
  }
});

test('selects the flagged original diversion record when both legs share the same FlightAware ID', async () => {
  const result = await lookup({ flights: [flight, { ...flight, diverted: true, status: 'Diverted' }] });
  assert.equal(result.status, 200);
  assert.equal(result.body.diverted, true);
  assert.equal(result.body.status, 'Diverted');
});

test('declines ambiguous matches and incomplete provider pages', async () => {
  const ambiguous = await lookup({ flights: [flight, { ...flight, fa_flight_id: 'flight-two' }] });
  assert.equal(ambiguous.status, 409);
  assert.deepEqual(ambiguous.body, { code: 'AMBIGUOUS_FLIGHT' });
  const incomplete = await lookup({ links: { next: '/next?page=2' } });
  assert.equal(incomplete.status, 503);
  assert.deepEqual(incomplete.body, { code: 'UNAVAILABLE' });
  assert.equal(incomplete.calls.length, 3);
});
