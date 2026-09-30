import assert from 'node:assert/strict';
import test, { before } from 'node:test';

let categories;
before(async () => {
  try { categories = await import('../src/itineraryCategories.js'); } catch { /* Missing implementation is reported by the behavior checks. */ }
});

test('saves the chosen meal icon and category together, replacing an inherited place category', () => {
  assert.ok(categories, 'Itinerary categories must be implemented');
  const place = { id: 'restaurant', name: '식당', category: 'sightseeing', emoji: '📍', time: '12:00', memo: '예약' };
  const next = categories.withItineraryIcon(place, '🍽️');
  assert.deepEqual(next, { id: 'restaurant', name: '식당', category: 'meal', emoji: '🍽️', time: '12:00', memo: '예약' });
  assert.equal(place.category, 'sightseeing');
});

test('changing a meal icon to a cafe icon updates the saved category and removes the automatic meal lock', () => {
  assert.ok(categories, 'Itinerary categories must be implemented');
  const next = categories.withItineraryIcon({ emoji: '🍽️', category: 'meal' }, '☕');
  assert.equal(next.category, 'cafe');
  assert.equal(categories.getItineraryItemCategory(next), 'cafe');
});

test('recognizes saved meal categories and older meal icons without guessing from place names', () => {
  assert.ok(categories, 'Itinerary categories must be implemented');
  for (const item of [{ category: 'meal' }, { category: 'food' }, { category: '식사' }, { emoji: '🍽️' }, { emoji: '🍽' }]) {
    assert.equal(categories.getItineraryItemCategory(item), 'meal');
  }
  assert.equal(categories.getItineraryItemCategory({ name: '식당 옆 관광지', emoji: '📸' }), 'sightseeing');
  assert.equal(categories.getItineraryItemCategory({ emoji: '☕' }), 'cafe');
});
