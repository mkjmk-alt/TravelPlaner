import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_NAVIGATION_HISTORY_KEY,
  getDefaultNavigationState,
  getNavigationStateFromHistory,
  getTabSelection,
  createNavigationHistoryState,
  normalizeNavigationState,
  getMobileRootPresentation
} from '../src/appNavigation.js';

test('provides a stable start state with four independent tab snapshots', () => {
  assert.deepEqual(getDefaultNavigationState(), {
    rootTab: 'trips',
    viewMode: 'trips',
    activeTripId: null,
    tabSnapshots: {
      trips: { viewMode: 'trips', activeTripId: null },
      map: { viewMode: 'trips', activeTripId: null },
      favorites: { viewMode: 'favorites', activeTripId: null },
      more: { viewMode: 'more', activeTripId: null }
    }
  });
});

test('restores a tab snapshot and resets the selected tab to its root', () => {
  const snapshots = {
    trips: { viewMode: 'itinerary', activeTripId: 'trip-1' },
    map: { viewMode: 'trips', activeTripId: 'trip-1' },
    favorites: { viewMode: 'favorites', activeTripId: 'trip-1' },
    more: { viewMode: 'more', activeTripId: 'trip-1' }
  };

  assert.deepEqual(getTabSelection({ currentRootTab: 'favorites', key: 'trips', tabSnapshots: snapshots }), {
    rootTab: 'trips', viewMode: 'itinerary', activeTripId: 'trip-1'
  });
  assert.deepEqual(getTabSelection({ currentRootTab: 'trips', key: 'trips', tabSnapshots: snapshots }), {
    rootTab: 'trips', viewMode: 'trips', activeTripId: 'trip-1'
  });
});

test('clears a deleted trip while keeping the requested screen valid', () => {
  const state = {
    rootTab: 'trips',
    viewMode: 'budget',
    activeTripId: 'deleted-trip',
    tabSnapshots: {
      trips: { viewMode: 'budget', activeTripId: 'deleted-trip' },
      map: { viewMode: 'trips', activeTripId: 'deleted-trip' },
      favorites: { viewMode: 'favorites', activeTripId: 'deleted-trip' },
      more: { viewMode: 'more', activeTripId: 'deleted-trip' }
    }
  };

  assert.deepEqual(normalizeNavigationState(state, ['trip-1']), {
    ...getDefaultNavigationState(),
    tabSnapshots: {
      trips: { viewMode: 'trips', activeTripId: null },
      map: { viewMode: 'trips', activeTripId: null },
      favorites: { viewMode: 'favorites', activeTripId: null },
      more: { viewMode: 'more', activeTripId: null }
    }
  });
});

test('round-trips app navigation through browser history state', () => {
  const state = {
    rootTab: 'trips',
    viewMode: 'itinerary',
    activeTripId: 'trip-1',
    tabSnapshots: getDefaultNavigationState().tabSnapshots
  };
  const historyState = createNavigationHistoryState(state);

  assert.equal(historyState[APP_NAVIGATION_HISTORY_KEY], true);
  assert.deepEqual(getNavigationStateFromHistory(historyState), state);
  assert.equal(getNavigationStateFromHistory({}), null);
});

test('uses map-only, itinerary-split, and content-only mobile roots', () => {
  assert.deepEqual(getMobileRootPresentation({ rootTab: 'map', viewMode: 'trips' }), {
    mapVisible: true, contentVisible: false, split: false
  });
  assert.deepEqual(getMobileRootPresentation({ rootTab: 'trips', viewMode: 'trips' }), {
    mapVisible: true, contentVisible: true, split: true
  });
  assert.deepEqual(getMobileRootPresentation({ rootTab: 'trips', viewMode: 'itinerary' }), {
    mapVisible: true, contentVisible: true, split: true
  });
  assert.deepEqual(getMobileRootPresentation({ rootTab: 'favorites', viewMode: 'favorites' }), {
    mapVisible: false, contentVisible: true, split: false
  });
});
