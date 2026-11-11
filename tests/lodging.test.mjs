import test from 'node:test';
import assert from 'node:assert/strict';
import { getLodgings, lodgingForDate, tripDayDate, validateLodging } from '../src/lodging.js';

test('lodging nights exclude checkout while changeover shows both events', () => {
  const stays = [
    { name: '삿포로', checkIn: '2026-11-28', checkOut: '2026-11-30' },
    { name: '하코다테', checkIn: '2026-11-30', checkOut: '2026-12-02' }
  ];
  assert.deepEqual(lodgingForDate(stays, '2026-11-29').map(x => [x.lodging.name, x.overnight]), [['삿포로', true]]);
  assert.deepEqual(lodgingForDate(stays, '2026-11-30').map(x => [x.lodging.name, x.checkIn, x.checkOut, x.overnight]), [['삿포로', false, true, false], ['하코다테', true, false, true]]);
  assert.equal(tripDayDate('2026-11-28', 3), '2026-11-30');
});

test('legacy stays are never migrated or assigned guessed dates', () => {
  const trip = { travelDetails: { stayName: '기존 호텔', stayAddress: '주소' } };
  assert.deepEqual(getLodgings(trip), []);
  assert.equal(trip.travelDetails.stayName, '기존 호텔');
  assert.deepEqual(lodgingForDate([{ name: '기존 호텔' }], '2026-11-29'), []);
});

test('validates dates without blocking same day stays', () => {
  assert.equal(validateLodging({ name: '호텔', checkIn: '2026-02-30', checkOut: '2026-03-01' }).includes('날짜'), true);
  assert.equal(validateLodging({ name: '호텔', checkIn: '2026-11-30', checkOut: '2026-11-29' }).includes('빠를'), true);
  assert.equal(validateLodging({ name: '호텔', checkIn: '2026-11-30', checkOut: '2026-11-30' }), '');
  assert.deepEqual(lodgingForDate([{ name: '호텔', checkIn: '2026-11-30', checkOut: '2026-11-30' }], '2026-11-30').map(x => [x.checkIn, x.checkOut, x.overnight]), [[true, true, false]]);
});

test('explicit itinerary addition avoids duplicates and dates outside trip', async () => {
  const { addLodgingEvents } = await import('../src/lodging.js');
  const trip = { startDate: '2026-11-28', itinerary: [{ day: 1, items: [] }, { day: 2, items: [] }, { day: 3, items: [] }] };
  const stay = { id: 'hotel-1', name: '호텔', address: '주소', checkIn: '2026-11-28', checkOut: '2026-11-30', checkInTime: '15:00', lat: 35.68, lng: 139.76, placeId: 'place-id' };
  let id = 0;
  const result = addLodgingEvents(trip, stay, () => String(++id));
  assert.equal(result.added, 2);
  assert.equal(result.itinerary[0].items[0].time, '15:00');
  assert.equal(result.itinerary[0].items[0].lat, 35.68);
  assert.equal(result.itinerary[0].items[0].placeId, 'place-id');
  assert.equal(result.itinerary[2].items[0].time, '');
  assert.equal(result.itinerary[2].items[0].lodgingEventKey, 'hotel-1:checkOut');
  assert.throws(() => addLodgingEvents({ ...trip, itinerary: result.itinerary }, stay, () => String(++id)), /이미 추가/);
  const outside = addLodgingEvents(trip, { ...stay, checkOut: '2026-12-01' }, () => String(++id));
  assert.equal(outside.added, 1);
});
