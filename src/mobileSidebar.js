export const getMobileViewModeSheetMode = ({ viewMode, viewportWidth, currentMode }) => {
  if (viewportWidth < 768 && viewMode === 'favorites') return 'full';
  return currentMode;
};
