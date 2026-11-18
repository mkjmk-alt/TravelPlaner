import assert from 'node:assert/strict';
import test from 'node:test';
import { getSavedPlaceEntries } from '../src/savedPlacePresentation.js';

test('a synced place with coordinates and no address stays visible and selectable', () => {
  const place = { id: 'coordinate-only', name: '저장한 위치', loc: '', lat: 43.06, lng: 141.35 };
  assert.deepEqual(getSavedPlaceEntries([place]), [
    { place, name: '저장한 위치', address: '', position: { lat: 43.06, lng: 141.35 } }
  ]);
});

test('legacy address fields work and missing coordinates do not produce a map marker', () => {
  const place = { id: 'address-only', displayName: '내 장소', address: '베트남 나트랑', lat: null, lng: '' };
  const outOfRange = { id: 'invalid-position', loc: '다른 장소', lat: 91, lng: 12 };
  const [legacy, invalid] = getSavedPlaceEntries([place, null, [], {}, outOfRange]);
  assert.deepEqual(legacy, { place, name: '내 장소', address: '베트남 나트랑', position: null });
  assert.deepEqual(invalid, { place: outOfRange, name: '다른 장소', address: '다른 장소', position: null });
  assert.equal(getSavedPlaceEntries([place, null, [], {}, outOfRange]).length, 2);
});
