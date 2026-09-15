import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createJournalEntry,
  getDefaultTravelDetails,
  getJournalEntries,
  getTravelDetails,
  getTripCountdownLabel,
  getTripDurationLabel
} from '../src/travelMemory.js';

test('provides stable defaults for optional travel details and journal data', () => {
  assert.deepEqual(getDefaultTravelDetails(), {
    departure: '',
    arrival: '',
    flightNumber: '',
    stayName: '',
    stayAddress: ''
  });
  assert.deepEqual(getTravelDetails({}), getDefaultTravelDetails());
  assert.deepEqual(getJournalEntries({}), []);
});

test('keeps existing travel details while filling missing fields', () => {
  assert.deepEqual(getTravelDetails({
    travelDetails: { arrival: '인천국제공항', stayName: '호텔' }
  }), {
    departure: '',
    arrival: '인천국제공항',
    flightNumber: '',
    stayName: '호텔',
    stayAddress: ''
  });
});

test('calculates a trip duration from inclusive start and end dates', () => {
  assert.equal(getTripDurationLabel({ startDate: '2026-09-01', endDate: '2026-09-05' }), '5일');
  assert.equal(getTripDurationLabel({ startDate: '', endDate: '' }), '일정 미정');
});

test('describes the trip countdown using date-only comparisons', () => {
  const trip = { startDate: '2026-09-10', endDate: '2026-09-14' };
  assert.equal(getTripCountdownLabel(trip, '2026-09-07'), '3일 후 출발');
  assert.equal(getTripCountdownLabel(trip, '2026-09-12'), '여행 중');
  assert.equal(getTripCountdownLabel(trip, '2026-09-15'), '여행 종료');
});

test('creates a serializable journal entry with normalized text fields', () => {
  assert.deepEqual(createJournalEntry({
    id: 'journal-1',
    date: '2026-09-12',
    title: '  첫날  ',
    body: '  도착해서 산책했다.  ',
    imageDataUrl: 'data:image/png;base64,abc',
    now: 1757635200000
  }), {
    id: 'journal-1',
    date: '2026-09-12',
    title: '첫날',
    body: '도착해서 산책했다.',
    imageDataUrl: 'data:image/png;base64,abc',
    createdAt: 1757635200000,
    updatedAt: 1757635200000
  });
});
