import assert from 'node:assert/strict';
import test from 'node:test';
import * as appNavigation from '../src/appNavigation.js';

import {
  APP_NAVIGATION_HISTORY_KEY,
  getDefaultNavigationState,
  getNavigationStateFromHistory,
  getTabSelection,
  createNavigationHistoryState,
  normalizeNavigationState,
  getMobileRootPresentation,
  getTripRequiredPresentation,
  getTripSubviewNavigationSelection,
  getPlaceCoordinates,
  getMemoryPlaceNavigationSelection,
  shouldShowMobileContextBar,
  shouldShowMobileMoreTripShortcuts
} from '../src/appNavigation.js';

test('provides a stable start state with five independent tab snapshots', () => {
  assert.deepEqual(getDefaultNavigationState(), {
    rootTab: 'trips',
    viewMode: 'trips',
    activeTripId: null,
    tabSnapshots: {
      trips: { viewMode: 'trips', activeTripId: null },
      favorites: { viewMode: 'favorites', activeTripId: null },
      budget: { viewMode: 'budget', activeTripId: null },
      memory: { viewMode: 'memory', activeTripId: null },
      more: { viewMode: 'more', activeTripId: null }
    }
  });
});

test('restores a tab snapshot and resets the selected tab to its root', () => {
  const snapshots = {
    trips: { viewMode: 'itinerary', activeTripId: 'trip-1' },
    favorites: { viewMode: 'favorites', activeTripId: 'trip-1' },
    budget: { viewMode: 'budget', activeTripId: 'trip-1' },
    memory: { viewMode: 'memory', activeTripId: 'trip-1' },
    more: { viewMode: 'more', activeTripId: 'trip-1' }
  };

  assert.deepEqual(getTabSelection({ currentRootTab: 'favorites', key: 'trips', tabSnapshots: snapshots }), {
    rootTab: 'trips', viewMode: 'itinerary', activeTripId: 'trip-1'
  });
  assert.deepEqual(getTabSelection({ currentRootTab: 'trips', key: 'trips', tabSnapshots: snapshots }), {
    rootTab: 'trips', viewMode: 'trips', activeTripId: 'trip-1'
  });
  assert.deepEqual(getTabSelection({ currentRootTab: 'trips', key: 'budget', tabSnapshots: snapshots }), {
    rootTab: 'budget', viewMode: 'budget', activeTripId: 'trip-1'
  });
});

test('uses the current trip when a destination tab has a stale trip snapshot', () => {
  const snapshots = {
    trips: { viewMode: 'itinerary', activeTripId: 'trip-current' },
    favorites: { viewMode: 'favorites', activeTripId: 'trip-current' },
    budget: { viewMode: 'budget', activeTripId: 'trip-old' },
    memory: { viewMode: 'memory', activeTripId: 'trip-old' },
    more: { viewMode: 'more', activeTripId: 'trip-current' }
  };

  assert.deepEqual(getTabSelection({
    currentRootTab: 'trips', key: 'budget', tabSnapshots: snapshots, activeTripId: 'trip-current'
  }), { rootTab: 'budget', viewMode: 'budget', activeTripId: 'trip-current' });
});

test('keeps the memory root but clears a deleted trip so its empty state can render', () => {
  const state = {
    rootTab: 'memory',
    viewMode: 'memory',
    activeTripId: 'deleted-trip',
    tabSnapshots: {
      trips: { viewMode: 'trips', activeTripId: 'deleted-trip' },
      favorites: { viewMode: 'favorites', activeTripId: 'deleted-trip' },
      budget: { viewMode: 'budget', activeTripId: 'deleted-trip' },
      memory: { viewMode: 'memory', activeTripId: 'deleted-trip' },
      more: { viewMode: 'more', activeTripId: 'deleted-trip' }
    }
  };

  assert.deepEqual(normalizeNavigationState(state, ['trip-1']), {
    rootTab: 'memory',
    viewMode: 'memory',
    activeTripId: null,
    tabSnapshots: {
      trips: { viewMode: 'trips', activeTripId: null },
      favorites: { viewMode: 'favorites', activeTripId: null },
      budget: { viewMode: 'budget', activeTripId: null },
      memory: { viewMode: 'memory', activeTripId: null },
      more: { viewMode: 'more', activeTripId: null }
    }
  });
});

test('migrates a saved map root to the trips split and keeps its valid trip', () => {
  const state = {
    rootTab: 'map',
    viewMode: 'trips',
    activeTripId: 'trip-1',
    tabSnapshots: {
      trips: { viewMode: 'trips', activeTripId: null },
      map: { viewMode: 'trips', activeTripId: 'trip-1' },
      favorites: { viewMode: 'favorites', activeTripId: 'trip-1' },
      more: { viewMode: 'more', activeTripId: 'trip-1' }
    }
  };

  assert.deepEqual(normalizeNavigationState(state, ['trip-1']), {
    rootTab: 'trips',
    viewMode: 'trips',
    activeTripId: 'trip-1',
    tabSnapshots: {
      trips: { viewMode: 'trips', activeTripId: 'trip-1' },
      favorites: { viewMode: 'favorites', activeTripId: 'trip-1' },
      budget: { viewMode: 'budget', activeTripId: null },
      memory: { viewMode: 'memory', activeTripId: null },
      more: { viewMode: 'more', activeTripId: 'trip-1' }
    }
  });
});

test('promotes legacy trips budget and memory snapshots to their own roots', () => {
  for (const viewMode of ['budget', 'memory']) {
    const state = {
      rootTab: 'trips',
      viewMode,
      activeTripId: 'trip-1',
      tabSnapshots: {
        trips: { viewMode, activeTripId: 'trip-1' },
        map: { viewMode: 'trips', activeTripId: 'trip-1' },
        favorites: { viewMode: 'favorites', activeTripId: 'trip-1' },
        more: { viewMode: 'more', activeTripId: 'trip-1' }
      }
    };
    const normalized = normalizeNavigationState(state, ['trip-1']);

    assert.equal(normalized.rootTab, viewMode);
    assert.equal(normalized.viewMode, viewMode);
    assert.deepEqual(normalized.tabSnapshots.trips, { viewMode: 'trips', activeTripId: 'trip-1' });
    assert.deepEqual(normalized.tabSnapshots[viewMode], { viewMode, activeTripId: 'trip-1' });
    assert.equal(Object.hasOwn(normalized.tabSnapshots, 'map'), false);
  }
});

test('round-trips five-root app navigation through browser history state', () => {
  const state = {
    rootTab: 'budget',
    viewMode: 'budget',
    activeTripId: 'trip-1',
    tabSnapshots: {
      trips: { viewMode: 'itinerary', activeTripId: 'trip-1' },
      favorites: { viewMode: 'favorites', activeTripId: 'trip-1' },
      budget: { viewMode: 'budget', activeTripId: 'trip-1' },
      memory: { viewMode: 'memory', activeTripId: 'trip-1' },
      more: { viewMode: 'more', activeTripId: 'trip-1' }
    }
  };
  const historyState = createNavigationHistoryState(state);

  assert.equal(historyState[APP_NAVIGATION_HISTORY_KEY], true);
  assert.deepEqual(getNavigationStateFromHistory(historyState), state);
  assert.equal(getNavigationStateFromHistory({}), null);

  const legacyHistory = createNavigationHistoryState({
    rootTab: 'map', viewMode: 'trips', activeTripId: 'trip-1',
    tabSnapshots: { map: { viewMode: 'trips', activeTripId: 'trip-1' } }
  });
  assert.equal(normalizeNavigationState(getNavigationStateFromHistory(legacyHistory), ['trip-1']).rootTab, 'trips');
  assert.deepEqual(getNavigationStateFromHistory(legacyHistory, ['trip-1']), {
    rootTab: 'trips',
    viewMode: 'trips',
    activeTripId: 'trip-1',
    tabSnapshots: {
      trips: { viewMode: 'trips', activeTripId: 'trip-1' },
      favorites: { viewMode: 'favorites', activeTripId: null },
      budget: { viewMode: 'budget', activeTripId: null },
      memory: { viewMode: 'memory', activeTripId: null },
      more: { viewMode: 'more', activeTripId: null }
    }
  });

  const readOnlyHistory = createNavigationHistoryState({
    rootTab: 'trips', viewMode: 'itinerary', activeTripId: 'readonly-share-1',
    tabSnapshots: { trips: { viewMode: 'itinerary', activeTripId: 'readonly-share-1' } }
  });
  assert.equal(getNavigationStateFromHistory(readOnlyHistory, ['readonly-share-1']).activeTripId, 'readonly-share-1');
});

test('uses the trips split for maps and content-only roots for every other tab', () => {
  assert.deepEqual(getMobileRootPresentation({ rootTab: 'trips', viewMode: 'trips' }), {
    mapVisible: true, contentVisible: true, split: true
  });
  assert.deepEqual(getMobileRootPresentation({ rootTab: 'trips', viewMode: 'itinerary' }), {
    mapVisible: true, contentVisible: true, split: true
  });
  assert.deepEqual(getMobileRootPresentation({ rootTab: 'favorites', viewMode: 'favorites' }), {
    mapVisible: false, contentVisible: true, split: false
  });
  for (const rootTab of ['budget', 'memory', 'more']) {
    assert.deepEqual(getMobileRootPresentation({ rootTab, viewMode: rootTab }), {
      mapVisible: false, contentVisible: true, split: false
    });
  }
  assert.deepEqual(getMobileRootPresentation({ rootTab: 'map', viewMode: 'trips' }), {
    mapVisible: true, contentVisible: true, split: true
  });
});

test('provides a trip-required message and trips action for budget and memory', () => {
  assert.deepEqual(getTripRequiredPresentation('budget'), {
    title: '예산·지출',
    message: '여행을 선택하면 예산과 지출을 관리할 수 있어요.',
    actionLabel: '내 여행으로 이동'
  });
  assert.deepEqual(getTripRequiredPresentation('memory'), {
    title: '여행 기록',
    message: '여행을 선택하면 여행 기록을 확인할 수 있어요.',
    actionLabel: '내 여행으로 이동'
  });
  assert.equal(getTripRequiredPresentation('trips'), null);
});

test('explains that a trip is required before adding a selected place to the itinerary', () => {
  assert.deepEqual(getTripRequiredPresentation('place'), {
    title: '여행을 선택하면 일정에 추가할 수 있어요.',
    message: '내 여행에서 여행을 선택하거나 새로 만든 뒤 장소를 다시 열어주세요.',
    actionLabel: '내 여행으로 이동'
  });
});

test('explains why a place cannot be added from a read-only shared trip', () => {
  assert.deepEqual(getTripRequiredPresentation('place', { isReadOnlyTrip: true }), {
    title: '공유된 여행은 조회 전용이에요.',
    message: '장소를 일정에 추가하려면 내 여행에서 편집 가능한 여행을 선택해주세요.',
    actionLabel: null
  });
});

test('opens budget and memory as root tabs only in bottom-navigation viewports', () => {
  assert.deepEqual(getTripSubviewNavigationSelection({
    viewMode: 'budget', activeTripId: 'trip-1', isBottomNavigationViewport: true
  }), { rootTab: 'budget', viewMode: 'budget', activeTripId: 'trip-1' });
  assert.deepEqual(getTripSubviewNavigationSelection({
    viewMode: 'memory', activeTripId: null, isBottomNavigationViewport: true
  }), { rootTab: 'memory', viewMode: 'memory', activeTripId: null });
  assert.deepEqual(getTripSubviewNavigationSelection({
    viewMode: 'budget', activeTripId: 'trip-1', isBottomNavigationViewport: false
  }), { rootTab: 'trips', viewMode: 'budget', activeTripId: 'trip-1' });
  assert.equal(getTripSubviewNavigationSelection({
    viewMode: 'favorites', activeTripId: 'trip-1', isBottomNavigationViewport: true
  }), null);
});

test('rejects unusable place coordinates and returns a trips-split destination for mobile', () => {
  assert.deepEqual(getPlaceCoordinates('35.6812', '139.7671'), { lat: 35.6812, lng: 139.7671 });
  assert.equal(getPlaceCoordinates('', 139.7671), null);
  assert.equal(getPlaceCoordinates(null, 139.7671), null);
  assert.equal(getPlaceCoordinates('north', 139.7671), null);
  assert.deepEqual(getMemoryPlaceNavigationSelection(true), {
    rootTab: 'trips', viewMode: 'trips', showSidebar: true
  });
  assert.equal(getMemoryPlaceNavigationSelection(false), null);
});

test('shows mobile context and duplicate more shortcuts only where appropriate', () => {
  assert.equal(shouldShowMobileContextBar({ isBottomNavigationViewport: true, viewMode: 'itinerary' }), true);
  assert.equal(shouldShowMobileContextBar({ isBottomNavigationViewport: true, viewMode: 'budget' }), false);
  assert.equal(shouldShowMobileContextBar({ isBottomNavigationViewport: true, viewMode: 'memory' }), false);
  assert.equal(shouldShowMobileContextBar({ isBottomNavigationViewport: false, viewMode: 'itinerary' }), false);
  assert.equal(shouldShowMobileMoreTripShortcuts({ isBottomNavigationViewport: true }), false);
  assert.equal(shouldShowMobileMoreTripShortcuts({ isBottomNavigationViewport: false }), true);
});

test('shows the search bar only when a bottom-navigation screen also shows the map', () => {
  const mobileCases = [
    ['trips', 'trips', true],
    ['trips', 'itinerary', true],
    ['favorites', 'favorites', false],
    ['budget', 'budget', false],
    ['memory', 'memory', false],
    ['more', 'more', false]
  ];

  for (const [rootTab, viewMode, expected] of mobileCases) {
    const { mapVisible } = appNavigation.getMobileRootPresentation({ rootTab, viewMode });
    assert.equal(appNavigation.shouldShowSearchBar({ isBottomNavigationViewport: true, mapVisible }), expected);
  }

  assert.equal(appNavigation.shouldShowSearchBar({ isBottomNavigationViewport: false, mapVisible: true }), true);
  assert.equal(appNavigation.shouldShowSearchBar({ isBottomNavigationViewport: false, mapVisible: false }), true);
});
