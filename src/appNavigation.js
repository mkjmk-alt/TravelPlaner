export const APP_NAVIGATION_HISTORY_KEY = 'travelPlanerNavigation';

export const ROOT_TABS = Object.freeze(['trips', 'favorites', 'budget', 'memory', 'more']);

const VIEW_MODES = Object.freeze(['trips', 'itinerary', 'budget', 'memory', 'favorites', 'more']);
const TRIP_SCOPED_VIEW_MODES = new Set(['itinerary', 'budget', 'memory']);

const getDefaultViewMode = (rootTab) => {
  if (rootTab === 'favorites') return 'favorites';
  if (rootTab === 'budget') return 'budget';
  if (rootTab === 'memory') return 'memory';
  if (rootTab === 'more') return 'more';
  return 'trips';
};

const migrateLegacyNavigationState = (state) => {
  const snapshots = { ...(state?.tabSnapshots || {}) };
  let rootTab = state?.rootTab;
  let viewMode = state?.viewMode;

  if (rootTab === 'map') {
    const mapTripId = snapshots.map?.activeTripId ?? state?.activeTripId ?? null;
    const tripsSnapshot = snapshots.trips || {};
    rootTab = 'trips';
    viewMode = 'trips';
    snapshots.trips = {
      ...tripsSnapshot,
      viewMode: 'trips',
      activeTripId: tripsSnapshot.activeTripId ?? mapTripId
    };
  }

  const legacyTripsSnapshot = snapshots.trips;
  if (legacyTripsSnapshot && ['budget', 'memory'].includes(legacyTripsSnapshot.viewMode)) {
    const legacyMode = legacyTripsSnapshot.viewMode;
    snapshots[legacyMode] = {
      ...legacyTripsSnapshot,
      viewMode: legacyMode,
      activeTripId: legacyTripsSnapshot.activeTripId ?? state?.activeTripId ?? null
    };
    snapshots.trips = {
      ...legacyTripsSnapshot,
      viewMode: 'trips'
    };
  }

  if (state?.rootTab === 'trips' && ['budget', 'memory'].includes(state?.viewMode)) {
    rootTab = state.viewMode;
    viewMode = state.viewMode;
    snapshots[state.viewMode] = {
      ...(snapshots[state.viewMode] || {}),
      viewMode: state.viewMode,
      activeTripId: state?.activeTripId ?? snapshots[state.viewMode]?.activeTripId ?? null
    };
    snapshots.trips = {
      ...(snapshots.trips || {}),
      viewMode: 'trips'
    };
  }

  delete snapshots.map;
  return { ...state, rootTab, viewMode, tabSnapshots: snapshots };
};

const createDefaultSnapshots = () => ROOT_TABS.reduce((snapshots, rootTab) => {
  snapshots[rootTab] = {
    viewMode: getDefaultViewMode(rootTab),
    activeTripId: null
  };
  return snapshots;
}, {});

export const getDefaultNavigationState = () => ({
  rootTab: 'trips',
  viewMode: 'trips',
  activeTripId: null,
  tabSnapshots: createDefaultSnapshots()
});

const normalizeTripId = (tripId, availableTripIds) => {
  if (tripId === null || tripId === undefined || tripId === '') return null;
  const candidate = String(tripId);
  return availableTripIds.has(candidate) ? tripId : null;
};

const normalizeSnapshot = (rootTab, snapshot, availableTripIds) => {
  const defaultViewMode = getDefaultViewMode(rootTab);
  const viewMode = VIEW_MODES.includes(snapshot?.viewMode) ? snapshot.viewMode : defaultViewMode;
  const activeTripId = normalizeTripId(snapshot?.activeTripId, availableTripIds);
  return {
    viewMode: TRIP_SCOPED_VIEW_MODES.has(viewMode) && !activeTripId ? defaultViewMode : viewMode,
    activeTripId
  };
};

export const normalizeNavigationState = (state, availableTripIds = []) => {
  const available = new Set((availableTripIds || []).map(tripId => String(tripId)));
  const fallback = getDefaultNavigationState();
  const migratedState = migrateLegacyNavigationState(state);
  const rootTab = ROOT_TABS.includes(migratedState?.rootTab) ? migratedState.rootTab : fallback.rootTab;
  const tabSnapshots = ROOT_TABS.reduce((snapshots, tab) => {
    snapshots[tab] = normalizeSnapshot(tab, migratedState?.tabSnapshots?.[tab], available);
    return snapshots;
  }, {});
  const activeTripId = normalizeTripId(migratedState?.activeTripId, available);
  const candidateViewMode = VIEW_MODES.includes(migratedState?.viewMode)
    ? migratedState.viewMode
    : getDefaultViewMode(rootTab);
  const viewMode = TRIP_SCOPED_VIEW_MODES.has(candidateViewMode) && !activeTripId
    ? getDefaultViewMode(rootTab)
    : candidateViewMode;

  return {
    rootTab,
    viewMode,
    activeTripId,
    tabSnapshots
  };
};

export const getTabSelection = ({ currentRootTab, key, tabSnapshots } = {}) => {
  const rootTab = ROOT_TABS.includes(key) ? key : 'trips';
  const snapshot = tabSnapshots?.[rootTab];
  if (currentRootTab === rootTab) {
    return {
      rootTab,
      viewMode: getDefaultViewMode(rootTab),
      activeTripId: snapshot?.activeTripId ?? null
    };
  }

  return {
    rootTab,
    viewMode: snapshot?.viewMode || getDefaultViewMode(rootTab),
    activeTripId: snapshot?.activeTripId ?? null
  };
};

export const createNavigationHistoryState = (state) => ({
  [APP_NAVIGATION_HISTORY_KEY]: true,
  ...state,
  tabSnapshots: state?.tabSnapshots || createDefaultSnapshots()
});

export const getNavigationStateFromHistory = (historyState) => {
  if (!historyState?.[APP_NAVIGATION_HISTORY_KEY]) return null;
  return {
    rootTab: historyState.rootTab,
    viewMode: historyState.viewMode,
    activeTripId: historyState.activeTripId ?? null,
    tabSnapshots: historyState.tabSnapshots || createDefaultSnapshots()
  };
};

export const getMobileRootPresentation = ({ rootTab, viewMode } = {}) => {
  if ((rootTab === 'trips' || rootTab === 'map') && ['trips', 'itinerary'].includes(viewMode)) {
    return { mapVisible: true, contentVisible: true, split: true };
  }
  return { mapVisible: false, contentVisible: true, split: false };
};

export const getTripRequiredPresentation = (viewMode) => {
  if (viewMode === 'budget') {
    return {
      title: '예산·지출',
      message: '여행을 선택하면 예산과 지출을 관리할 수 있어요.',
      actionLabel: '내 여행으로 이동'
    };
  }
  if (viewMode === 'memory') {
    return {
      title: '여행 기록',
      message: '여행을 선택하면 여행 기록을 확인할 수 있어요.',
      actionLabel: '내 여행으로 이동'
    };
  }
  return null;
};

export const getTripSubviewNavigationSelection = ({ viewMode, activeTripId, isBottomNavigationViewport } = {}) => {
  if (!['budget', 'memory'].includes(viewMode)) return null;
  return {
    rootTab: isBottomNavigationViewport ? viewMode : 'trips',
    viewMode,
    activeTripId: activeTripId ?? null
  };
};

export const getPlaceCoordinates = (lat, lng) => {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude };
};

export const getMemoryPlaceNavigationSelection = (isBottomNavigationViewport) => (
  isBottomNavigationViewport
    ? { rootTab: 'trips', viewMode: 'trips', showSidebar: true }
    : null
);

export const shouldShowMobileContextBar = ({ isBottomNavigationViewport, viewMode } = {}) => (
  Boolean(isBottomNavigationViewport && viewMode === 'itinerary')
);

export const shouldShowMobileMoreTripShortcuts = ({ isBottomNavigationViewport } = {}) => (
  !isBottomNavigationViewport
);

export const shouldShowSearchBar = ({ isBottomNavigationViewport, mapVisible } = {}) => (
  !isBottomNavigationViewport || Boolean(mapVisible)
);
