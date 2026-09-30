import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { buildItineraryRouteGroups } from '../src/itineraryRoutes.js';

let order;
before(async () => {
  try { order = await import('../src/itineraryOrder.js'); } catch { /* Report missing behavior as a test assertion. */ }
});
const api = () => {
  assert.ok(order, 'The daily nearby-order implementation must exist');
  return order;
};
const place = (id, lng, time) => ({ id, name: id, lat: 0, lng, time, memo: `${id} memo` });
const ids = items => items.map(item => item.id);

test('starts at the first place and chooses the nearest unvisited place from each next stop', () => {
  const day = { day: 1, items: [place('start', 0, '09:00'), place('far', 3, '10:00'), place('near', 1, '11:00'), place('middle', 2, '12:00')] };
  const original = JSON.stringify(day);
  const preview = api().createNearbyOrderPreview(day);
  assert.deepEqual(ids(preview.items), ['start', 'near', 'middle', 'far']);
  assert.equal(preview.changed, true);
  assert.deepEqual(preview.items.map(item => item.time), ['09:00', '10:00', '11:00', '12:00']);
  assert.equal(preview.items[3].memo, 'far memo');
  assert.equal(JSON.stringify(day), original, 'Preview must not mutate the saved day');
  assert.ok(Math.abs(preview.beforeMeters - 667170) < 100);
  assert.ok(Math.abs(preview.afterMeters - 333585) < 100);
});

test('uses distance from the latest stop, not a single radial sort from the start', () => {
  const preview = api().createNearbyOrderPreview({ day: 1, items: [place('start', 0), place('west', -3), place('east-far', 4), place('east-near', 1)] });
  assert.deepEqual(ids(preview.items), ['start', 'east-near', 'east-far', 'west']);
});

test('keeps invalid-coordinate items in their original slots and accepts zero and numeric strings', () => {
  const note = { id: 'note', name: '예약', lat: null, lng: 0 };
  const invalid = { id: 'invalid', lat: 91, lng: 0 };
  const day = { day: '2일차', items: [place('start', 0), place('far', '3'), note, place('near', '1'), invalid, place('middle', '2')] };
  const preview = api().createNearbyOrderPreview(day);
  assert.deepEqual(ids(preview.items), ['start', 'near', 'note', 'middle', 'invalid', 'far']);
  assert.equal(preview.missingCount, 2);
  assert.equal(preview.items[2], note);
  assert.equal(preview.items[4], invalid);
});

test('does not invent a starting location or shuffle an empty or two-place itinerary', () => {
  for (const items of [[], [place('only', 0)], [place('a', 0), place('b', 2)]]) {
    const preview = api().createNearbyOrderPreview({ day: 1, items });
    assert.deepEqual(preview.items, items);
    assert.equal(preview.changed, false);
    assert.equal(preview.reason, 'too-few');
  }
  const items = [{ id: 'unknown', lat: '', lng: '' }, place('far', 3), place('near', 1), place('middle', 2)];
  const preview = api().createNearbyOrderPreview({ day: 1, items });
  assert.equal(preview.reason, 'start-missing');
  assert.deepEqual(preview.items, items);
});

test('keeps ties and duplicate locations stable and reports an already-nearby order', () => {
  const day = { day: 1, items: [place('start', 0), place('same-a', 0), place('same-b', 0), place('east', 1), place('west', -1)] };
  const preview = api().createNearbyOrderPreview(day);
  assert.deepEqual(ids(preview.items), ['start', 'same-a', 'same-b', 'east', 'west']);
  assert.equal(preview.changed, false);
  assert.equal(preview.reason, 'already-nearby');
});

test('measures across the date line rather than treating adjacent longitudes as far apart', () => {
  const preview = api().createNearbyOrderPreview({ day: 1, items: [place('start', 179), place('far', 170), place('across', -179), place('near', 178)] });
  assert.deepEqual(ids(preview.items), ['start', 'near', 'across', 'far']);
});

test('applies to just the selected day and rejects a stale preview after edits or day deletion', () => {
  const selected = { day: 1, title: '오사카', items: [place('a', 0), place('c', 3), place('b', 1)] };
  const other = { day: 2, items: [place('x', 10)] };
  const itinerary = [selected, other];
  const preview = api().createNearbyOrderPreview(selected);
  const next = api().applyNearbyOrderPreview(itinerary, preview);
  assert.deepEqual(ids(next[0].items), ['a', 'b', 'c']);
  assert.equal(next[0].orderMode, 'distance');
  assert.equal(next[0].title, '오사카');
  assert.equal(next[1], other);
  assert.deepEqual(buildItineraryRouteGroups({ itinerary: next, activeDay: 1 })[0].points, [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 3 }], 'Map arrows must consume the newly saved visit order');
  assert.deepEqual(ids(selected.items), ['a', 'c', 'b']);
  const edited = { ...selected, items: selected.items.map(item => item.id === 'b' ? { ...item, memo: 'new' } : item) };
  assert.equal(api().applyNearbyOrderPreview([edited, other], preview), null);
  assert.equal(api().applyNearbyOrderPreview([other], preview), null);
  assert.equal(api().applyNearbyOrderPreview(next, preview), null, 'A preview cannot apply twice');
});

test('preserves the chosen order after time edits and appended places but leaves legacy time ordering intact', () => {
  const day = { day: 1, orderMode: 'distance' };
  const items = [place('a', 0, '12:00'), place('b', 1, '08:00'), place('new', 2, '07:00')];
  assert.deepEqual(ids(api().sortDayItems(day, items)), ['a', 'b', 'new']);
  assert.deepEqual(ids(api().sortDayItems({ day: 2 }, items)), ['new', 'b', 'a']);
  assert.deepEqual(ids(items), ['a', 'b', 'new']);
});

test('keeps the existing time slots when manually adjusting a distance-sorted day', () => {
  const items = [place('a', 0, '09:00'), place('b', 1, '10:00'), place('c', 2, '11:00')];
  const day = { day: 1, orderMode: 'distance', items };
  const next = api().moveDayItem(day, 'c', 'up');
  assert.deepEqual(ids(next.items), ['a', 'c', 'b']);
  assert.deepEqual(next.items.map(item => item.time), ['09:00', '10:00', '11:00']);
  assert.equal(api().moveDayItem(day, 'a', 'up'), day);
  assert.equal(api().moveDayItem(day, 'missing', 'up'), day);
  assert.deepEqual(ids(day.items), ['a', 'b', 'c']);
  const legacy = api().moveDayItem({ day: 2, items: [place('a', 0, '09:00'), place('b', 1, '10:00')] }, 'b', 'up');
  assert.deepEqual(ids(legacy.items), ['b', 'a']);
  assert.deepEqual(legacy.items.map(item => item.time), ['09:00', '10:00']);
});

test('pins meals at their saved times and sorts places separately before and after each meal', () => {
  const lunch = { ...place('lunch', 10, '12:00'), category: 'meal', reservationNumber: 'booking-123' };
  const dinner = { ...place('dinner', 20, '18:00'), emoji: '🍽️' };
  const day = { day: 1, items: [
    place('start', 0, '09:00'), place('far-before', 3, '10:00'), place('near-before', 1, '11:00'), lunch,
    place('far-after', 13, '13:00'), place('near-after', 11, '14:00'), dinner,
    place('far-evening', 23, '19:00'), place('near-evening', 21, '20:00')
  ] };
  const snapshot = JSON.stringify(day);
  const preview = api().createNearbyOrderPreview(day);
  assert.deepEqual(ids(preview.items), ['start', 'near-before', 'far-before', 'lunch', 'near-after', 'far-after', 'dinner', 'near-evening', 'far-evening']);
  assert.deepEqual(preview.items.map(item => item.time), ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '18:00', '19:00', '20:00']);
  assert.equal(preview.items[3], lunch);
  assert.equal(preview.items[6], dinner);
  assert.equal(preview.mealCount, 2);
  assert.equal(JSON.stringify(day), snapshot);
});

test('restores chronological slots in days scrambled by a previous sort without inventing times', () => {
  const lunch = { ...place('lunch', 2, '12:00'), emoji: '🍽️' };
  const day = { day: 1, orderMode: 'distance', items: [
    place('start', 0, '09:00'), lunch, place('near', 1, '11:00'), place('far', 3, '10:00'), place('after', 4, '13:00')
  ] };
  const preview = api().createNearbyOrderPreview(day);
  assert.deepEqual(ids(preview.items), ['start', 'near', 'far', 'lunch', 'after']);
  assert.deepEqual(preview.items.map(item => item.time), ['09:00', '10:00', '11:00', '12:00', '13:00']);
  assert.equal(preview.items[3], lunch);
  assert.deepEqual(preview.originalIndices, [0, 2, 3, 1, 4]);
});

test('pins a meal with no coordinates and preserves blank time slots and reservation details', () => {
  const lunch = { id: 'lunch', name: '식사 예약', category: 'food', time: '12:00' };
  const blank = { ...place('near', 1), reservationUrl: 'https://example.com/booking', memo: 'bring ticket' };
  const day = { day: 1, items: [place('start', 0, '09:00'), blank, place('far', 3, '11:00'), lunch, place('after', 4, '13:00')] };
  const preview = api().createNearbyOrderPreview(day);
  assert.equal(preview.items[3], lunch);
  assert.deepEqual(preview.items.map(item => item.time), ['09:00', undefined, '11:00', '12:00', '13:00']);
  assert.equal(preview.mealCount, 1);
  assert.equal(preview.items.find(item => item.id === 'near').reservationUrl, 'https://example.com/booking');
});
