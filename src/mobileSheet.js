const DEFAULT_TOP_OFFSET = 112;
const DEFAULT_COLLAPSED_HANDLE_HEIGHT = 60;

export const getMobileSheetSnapPoints = (
  height,
  topOffset = DEFAULT_TOP_OFFSET,
  collapsedHandleHeight = DEFAULT_COLLAPSED_HANDLE_HEIGHT
) => {
  const viewportHeight = Math.max(0, Number(height) || 0);
  const collapsedPosition = Math.max(0, viewportHeight - collapsedHandleHeight);
  return {
    full: Math.min(topOffset, collapsedPosition),
    half: Math.min(viewportHeight * 0.5, collapsedPosition),
    collapsed: collapsedPosition
  };
};

export const getMobileSheetPosition = ({
  height,
  mode,
  dragOffset = 0,
  topOffset = DEFAULT_TOP_OFFSET,
  collapsedHandleHeight = DEFAULT_COLLAPSED_HANDLE_HEIGHT
}) => {
  const snapPoints = getMobileSheetSnapPoints(height, topOffset, collapsedHandleHeight);
  const basePosition = snapPoints[mode] ?? snapPoints.half;
  const requestedPosition = basePosition + (Number(dragOffset) || 0);
  return Math.max(snapPoints.full, Math.min(snapPoints.collapsed, requestedPosition));
};

export const getClosestMobileSheetMode = (position, snapPoints) => Object.entries(snapPoints)
  .reduce((closestMode, [mode, snapPosition]) => (
    Math.abs(position - snapPosition) < Math.abs(position - snapPoints[closestMode])
      ? mode
      : closestMode
  ), 'full');
