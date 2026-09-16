export const APP_NAVIGATION_HISTORY_KEY = 'travelPlanerNavigation';

export const ROOT_TABS = Object.freeze(['trips', 'map', 'favorites', 'more']);

const VIEW_MODES = Object.freeze(['trips', 'itinerary', 'budget', 'memory', 'favorites', 'more']);
const TRIP_SCOPED_VIEW_MODES = new Set(['itinerary', 'budget', 'memory']);

const getDefaultViewMode = (rootTab) => {
  if (rootTab === 'favorites') return 'favorites';
  if (rootTab === 'more') return 'more';
  return 'trips';
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
  const rootTab = ROOT_TABS.includes(state?.rootTab) ? state.rootTab : fallback.rootTab;
  const tabSnapshots = ROOT_TABS.reduce((snapshots, tab) => {
    snapshots[tab] = normalizeSnapshot(tab, state?.tabSnapshots?.[tab], available);
    return snapshots;
  }, {});
  const activeTripId = normalizeTripId(state?.activeTripId, available);
  const candidateViewMode = VIEW_MODES.includes(state?.viewMode)
    ? state.viewMode
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
  if (rootTab === 'map') {
    return { mapVisible: true, contentVisible: false, split: false };
  }
  if (viewMode === 'itinerary') {
    return { mapVisible: true, contentVisible: true, split: true };
  }
  return { mapVisible: false, contentVisible: true, split: false };
};
