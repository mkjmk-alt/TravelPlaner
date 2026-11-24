import assert from 'node:assert/strict';
import test from 'node:test';
import { getGooglePlaceID, safePlaceLink, placeMapsURL, placeClosure, visitAvailability } from '../src/placeBusinessDetails.js';

const point = (day, hour, minute = 0) => ({ day, hour, minute });
const now = new Date('2026-11-24T16:00:00Z');
const details = {
  timeZone: { id: 'Asia/Tokyo' },
  regularOpeningHours: { periods: [
    { open: point(6, 20), close: point(0, 2) },
    { open: point(0, 12), close: point(0, 14) },
    { open: point(0, 17), close: point(0, 21) }
  ] }
};
const check = (date, time, more = {}) => visitAvailability({ date, time, details: { ...details, ...more }, now });

test('the displayed day uses the place time zone and checks overnight hours and breaks', () => {
  assert.equal(check('2026-11-24', '20:00'), null);
  assert.deepEqual(check('2026-11-29', '01:30'), { open: true, current: false });
  assert.deepEqual(check('2026-11-29', '02:00'), { open: false, current: false });
  assert.deepEqual(check('2026-11-29', '15:00'), { open: false, current: false });
  assert.deepEqual(check('2026-11-29', '18:30'), { open: true, current: false });
});

test('uses provider overrides for the seven-day window, including full closures', () => {
  const exceptional = { currentOpeningHours: { periods: [] } };
  assert.deepEqual(check('2026-11-29', '18:30', exceptional), { open: false, current: true });
  assert.deepEqual(check('2026-12-06', '18:30', exceptional), { open: true, current: false });
  assert.equal(check('2026-11-29', ''), null);
  assert.equal(check('2026-11-29', '18:30', { regularOpeningHours: null }), null);
});

test('reads both web and native place IDs and keeps menu navigation to ordinary web links', () => {
  assert.equal(getGooglePlaceID({ placeId: ' native-id ' }), 'native-id');
  assert.equal(getGooglePlaceID({ googlePlaceId: ' web-id ' }), 'web-id');
  const params = new URL(placeMapsURL({ name: '삿포로 식당', placeId: 'native-id' })).searchParams;
  assert.equal(params.get('query'), '삿포로 식당');
  assert.equal(params.get('query_place_id'), 'native-id');
  assert.equal(safePlaceLink('javascript:alert(1)'), '');
  assert.equal(safePlaceLink('https://a:b@example.com/'), '');
  assert.equal(safePlaceLink('https://example.com/menu'), 'https://example.com/menu');
  assert.equal(placeClosure('OPERATIONAL'), '');
  assert.equal(placeClosure('CLOSED_TEMPORARILY'), '임시 휴업');
});
