const BOTTOM_NAVIGATION_ITEMS = Object.freeze([
  Object.freeze({ key: 'trips', label: '내 여행' }),
  Object.freeze({ key: 'map', label: '지도' }),
  Object.freeze({ key: 'favorites', label: '저장' }),
  Object.freeze({ key: 'more', label: '더보기' })
]);

export const getBottomNavigationItems = () => BOTTOM_NAVIGATION_ITEMS.map((item) => ({ ...item }));

export const getBottomNavigationSelection = (key) => {
  switch (key) {
    case 'map':
      return { rootTab: 'map', viewMode: 'trips', showSidebar: false };
    case 'favorites':
      return { rootTab: 'favorites', viewMode: 'favorites', showSidebar: true };
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
