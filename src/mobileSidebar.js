const BOTTOM_NAVIGATION_ITEMS = Object.freeze([
  Object.freeze({ key: 'trips', label: '내 여행' }),
  Object.freeze({ key: 'favorites', label: '저장' }),
  Object.freeze({ key: 'budget', label: '예산·지출' }),
  Object.freeze({ key: 'memory', label: '여행 기록' }),
  Object.freeze({ key: 'more', label: '더보기' })
]);

export const getBottomNavigationItems = () => BOTTOM_NAVIGATION_ITEMS.map((item) => ({ ...item }));

export const getBottomNavigationSelection = (key) => {
  switch (key) {
    case 'favorites':
      return { rootTab: 'favorites', viewMode: 'favorites', showSidebar: true };
    case 'budget':
      return { rootTab: 'budget', viewMode: 'budget', showSidebar: true };
    case 'memory':
      return { rootTab: 'memory', viewMode: 'memory', showSidebar: true };
    case 'more':
      return { rootTab: 'more', viewMode: 'more', showSidebar: true };
    case 'trips':
    default:
      return { rootTab: 'trips', viewMode: 'trips', showSidebar: true };
  }
};

export const getMobileViewModeSheetMode = ({ viewMode, viewportWidth, currentMode }) => {
  if (viewportWidth < 768 && viewMode === 'favorites') return 'full';
  return currentMode;
};
