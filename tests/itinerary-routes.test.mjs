import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeRouteSettings,
  getRoutePoint,
  buildItineraryRouteGroups,
  createRoadRouteResolver,
  resolveRoadRouteGroups
} from '../src/itineraryRoutes.js';

const a = { lat: 35, lng: 139 };
const b = { lat: 35.01, lng: 139.02 };
const c = { lat: 35.03, lng: 139.04 };

test('restores supported settings and falls back safely for old or invalid stored values', () => {
  assert.deepEqual(normalizeRouteSettings(null), { mode: 'straight', travelMode: 'DRIVING' });
  assert.deepEqual(normalizeRouteSettings({ mode: 'road', travelMode: 'WALKING' }), { mode: 'road', travelMode: 'WALKING' });
  assert.deepEqual(normalizeRouteSettings({ mode: 'garbage', travelMode: 'FLYING' }), { mode: 'straight', travelMode: 'DRIVING' });
});

test('accepts equator and prime-meridian coordinates without treating missing coordinates as zero', () => {
  assert.deepEqual(getRoutePoint({ lat: '0', lng: '0' }), { lat: 0, lng: 0 });
  for (const point of [{ lat: null, lng: 2 }, { lat: '', lng: 2 }, { lat: 95, lng: 2 }, { lat: 1, lng: Infinity }]) {
    assert.equal(getRoutePoint(point), null);
  }
});

test('keeps itinerary order, true day labels and day colors when empty days are skipped', () => {
  const itinerary = [
    { day: 1, items: [a, b] },
    { day: 2, items: [] },
    { day: 3, items: [c, a] }
  ];
  const daily = buildItineraryRouteGroups({ itinerary, activeDay: 3, showFullRoute: false });
  assert.deepEqual(daily.map(group => group.points), [[c, a]]);
  assert.equal(daily[0].day, 3);
  assert.equal(daily[0].colorIndex, 2);
  const full = buildItineraryRouteGroups({ itinerary, showFullRoute: true });
  assert.deepEqual(full.map(group => group.kind), ['day', 'bridge', 'day']);
  assert.deepEqual(full[1].points, [b, c]);
  assert.deepEqual(buildItineraryRouteGroups({ itinerary, activeDay: 'reserve' }), []);
});

test('requests a navigable path and deduplicates simultaneous requests without optimizing the itinerary', async () => {
  const calls = [];
  const curvedPath = [a, { lat: 35.005, lng: 139 }, b];
  const resolver = createRoadRouteResolver({ computeRoutes: async request => {
    calls.push(request);
    return { routes: [{ path: curvedPath, warnings: ['歩行経路の注意'] }] };
  } });
  const [first, second] = await Promise.all([resolver(a, b, 'WALKING'), resolver(a, b, 'WALKING')]);
  assert.equal(calls.length, 1);
  assert.deepEqual(first.path, curvedPath);
  assert.deepEqual(first, second);
  assert.deepEqual(first.warnings, ['歩行経路の注意']);
  assert.deepEqual(calls[0].origin, a);
  assert.deepEqual(calls[0].destination, b);
  assert.equal(calls[0].travelMode, 'WALKING');
  assert.deepEqual(calls[0].fields, ['path', 'warnings']);
  await resolver(b, a, 'WALKING');
  await resolver(a, b, 'DRIVING');
  assert.equal(calls.length, 3, 'direction and transport must have distinct cached paths');
});

test('does not cache errors and bounds the session cache', async () => {
  let calls = 0;
  const resolver = createRoadRouteResolver({ cacheLimit: 1, computeRoutes: async request => {
    calls += 1;
    if (calls === 1) throw new Error('temporary network failure');
    return { routes: [{ path: [request.origin, request.destination] }] };
  } });
  await assert.rejects(resolver(a, b, 'DRIVING'));
  await resolver(a, b, 'DRIVING');
  await resolver(b, c, 'DRIVING');
  await resolver(a, b, 'DRIVING');
  assert.equal(calls, 4);
});

test('keeps curved segments in itinerary order and never draws a straight road across a missing connection', async () => {
  const groups = [{ id: 'day-1', kind: 'day', day: 1, colorIndex: 0, points: [a, b, c, a] }];
  const result = await resolveRoadRouteGroups({ groups, resolveRoute: async (origin, destination) => {
    if (origin === b) return { path: [], warnings: [] };
    if (origin === a) await new Promise(resolve => setTimeout(resolve, 5));
    return { path: [origin, { lat: origin.lat, lng: destination.lng }, destination], warnings: [] };
  } });
  assert.equal(result.total, 3);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.segments.map(segment => [segment.path[0], segment.path.at(-1)]), [[a, b], [c, a]]);
  assert.equal(result.segments[0].path.length, 3);
});

test('does not request directions for identical successive points or fewer than two valid locations', async () => {
  let calls = 0;
  const result = await resolveRoadRouteGroups({
    groups: [{ id: 'day-1', points: [a, a] }, { id: 'day-2', points: [b] }],
    resolveRoute: async () => { calls += 1; }
  });
  assert.equal(result.total, 0);
  assert.equal(calls, 0);
});

test('limits concurrency and stops queued requests after an API permission failure', async () => {
  let calls = 0;
  const result = await resolveRoadRouteGroups({
    groups: [{ id: 'day-1', points: [a, b, c, a, b, c] }],
    resolveRoute: async () => { calls += 1; throw Object.assign(new Error('PERMISSION_DENIED'), { code: 7 }); }
  });
  assert.ok(calls <= 2);
  assert.equal(result.error, 'permission');
  assert.equal(result.segments.length, 0);
});

test('stops old itinerary work when it is cancelled', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(resolveRoadRouteGroups({
    groups: [{ id: 'day-1', points: [a, b, c, a, b] }],
    signal: controller.signal,
    resolveRoute: async (origin, destination) => {
      calls += 1;
      controller.abort();
      return { path: [origin, destination], warnings: [] };
    }
  }), { name: 'AbortError' });
  assert.ok(calls <= 2);
});
