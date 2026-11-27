import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTripsByStatus } from '../src/tripWorkflow.js';

test('trip groups show in-progress trips, upcoming departures, past trips and undated trips in order', () => {
  const trips = [
    { id: 'far', startDate: '2026-12-08' },
    { id: 'recent', startDate: '2026-11-20', endDate: '2026-11-25' },
    { id: 'invalid', startDate: '2026-02-30' },
    { id: 'near', startDate: '2026-11-28' },
    { id: 'ongoing', startDate: '2026-11-24', endDate: '2026-11-27' },
    { id: 'older', startDate: '2026-11-18' },
    { id: 'today', startDate: '2026-11-27' }
  ];

  assert.deepEqual(groupTripsByStatus(trips, '2026-11-27').map(({ key, trips }) => [
    key, trips.map(trip => trip.id)
  ]), [
    ['ongoing', ['today', 'ongoing']],
    ['upcoming', ['near', 'far']],
    ['past', ['recent', 'older']],
    ['unknown', ['invalid']]
  ]);
});
