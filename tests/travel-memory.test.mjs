import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createJournalEntry,
  getDefaultTravelDetails,
  getItineraryPlaceOptions,
  getJournalEntryDay,
  getJournalEntries,
  getTravelDetails,
  getTripCountdownLabel,
  getTripDayOptions,
  getTripDurationLabel,
  sortJournalEntriesForTimeline
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

test('flattens itinerary places with stable day and map metadata', () => {
  assert.deepEqual(getItineraryPlaceOptions({
    itinerary: [
      { day: 1, items: [{ id: 'place-1', name: '시장', displayName: '아침 시장', loc: '중구', lat: 22.3, lng: 114.17 }] },
      { day: 2, items: [{ id: 'place-2', name: '공원', loc: '센트럴', lat: '22.28', lng: '114.16' }] }
    ]
  }), [
    {
      key: '1:place-1',
      day: 1,
      id: 'place-1',
      name: '아침 시장',
      address: '중구',
      lat: 22.3,
      lng: 114.17,
      emoji: '📍'
    },
    {
      key: '2:place-2',
      day: 2,
      id: 'place-2',
      name: '공원',
      address: '센트럴',
      lat: 22.28,
      lng: 114.16,
      emoji: '📍'
    }
  ]);
});

test('stores selected itinerary place metadata in a journal entry', () => {
  assert.deepEqual(createJournalEntry({
    id: 'journal-place-1',
    date: '2026-09-12',
    title: '시장 산책',
    place: {
      key: '1:place-1',
      day: 1,
      id: 'place-1',
      name: '아침 시장',
      address: '중구',
      lat: 22.3,
      lng: 114.17,
      emoji: '🛍️'
    },
    now: 1757635200000
  }), {
    id: 'journal-place-1',
    date: '2026-09-12',
    title: '시장 산책',
    body: '',
    imageDataUrl: '',
    place: {
      key: '1:place-1',
      day: 1,
      id: 'place-1',
      name: '아침 시장',
      address: '중구',
      lat: 22.3,
      lng: 114.17,
      emoji: '🛍️'
    },
    createdAt: 1757635200000,
    updatedAt: 1757635200000
  });
});

test('normalizes saved journal place metadata without breaking older entries', () => {
  assert.deepEqual(getJournalEntries({ journalEntries: [
    { id: 'old', title: '예전 기록' },
    { id: 'new', place: { day: '2', id: 'place-2', name: '공원', address: '센트럴', lat: '22.28', lng: '114.16' } }
  ] }), [
    {
      id: 'old', date: '', title: '예전 기록', body: '', imageDataUrl: '', createdAt: 0, updatedAt: 0
    },
    {
      id: 'new', date: '', title: '', body: '', imageDataUrl: '',
      place: { key: '2:place-2', day: 2, id: 'place-2', name: '공원', address: '센트럴', lat: 22.28, lng: 114.16, emoji: '📍' },
      createdAt: 0, updatedAt: 0
    }
  ]);
});

test('builds ordered day filter options from itinerary or trip dates', () => {
  assert.deepEqual(getTripDayOptions({
    itinerary: [{ day: 2 }, { day: 1 }, { day: 2 }, { day: '3' }]
  }), [1, 2, 3]);
  assert.deepEqual(getTripDayOptions({
    startDate: '2026-09-10',
    endDate: '2026-09-12'
  }), [1, 2, 3]);
});

test('resolves a journal entry day from its place before falling back to its date', () => {
  const trip = { startDate: '2026-09-10', endDate: '2026-09-12' };
  assert.equal(getJournalEntryDay({ date: '2026-09-10', place: { day: 3 } }, trip), 3);
  assert.equal(getJournalEntryDay({ date: '2026-09-11' }, trip), 2);
  assert.equal(getJournalEntryDay({ date: '2026-09-15' }, trip), null);
  assert.equal(getJournalEntryDay({ date: '' }, trip), null);
});

test('sorts journal entries chronologically without mutating the source array', () => {
  const entries = [
    { id: 'new', date: '2026-09-12', createdAt: 2 },
    { id: 'undated', date: '', createdAt: 3 },
    { id: 'old', date: '2026-09-10', createdAt: 1 }
  ];
  const sorted = sortJournalEntriesForTimeline(entries);

  assert.deepEqual(sorted.map(entry => entry.id), ['old', 'new', 'undated']);
  assert.deepEqual(entries.map(entry => entry.id), ['new', 'undated', 'old']);
});
