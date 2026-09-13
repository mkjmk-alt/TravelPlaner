import { getMobileSheetPosition } from './mobileSheet.js';

export const DISPLAY_MODES = Object.freeze({
  CLASSIC: 'classic',
  SPLIT: 'split'
});

export const normalizeDisplayMode = (mode) => (
  mode === DISPLAY_MODES.SPLIT ? DISPLAY_MODES.SPLIT : DISPLAY_MODES.CLASSIC
);

export const getSplitViewScrollContainer = (mode) => (
  normalizeDisplayMode(mode) === DISPLAY_MODES.SPLIT ? 'sidebar' : 'list'
);

export const getFreeSplitPanePosition = ({
  height,
  position,
  dragOffset = 0,
  topOffset = 112,
  dividerHeight = 60
}) => {
  const viewportHeight = Math.max(0, Number(height) || 0);
  const maximumPosition = Math.max(0, viewportHeight - dividerHeight);
  const minimumPosition = Math.min(Math.max(0, Number(topOffset) || 0), maximumPosition);
  const basePosition = Number.isFinite(Number(position))
    ? Number(position)
    : viewportHeight * 0.5;
  const requestedPosition = basePosition + (Number(dragOffset) || 0);

  return Math.max(minimumPosition, Math.min(maximumPosition, requestedPosition));
};

export const getSplitPaneLayout = ({
  height,
  sheetMode = 'half',
  dragOffset = 0,
  position,
  topOffset = 112,
  dividerHeight = 60
}) => {
  const viewportHeight = Math.max(0, Number(height) || 0);
  const sheetPosition = Number.isFinite(Number(position))
    ? getFreeSplitPanePosition({
      height: viewportHeight,
      position,
      dragOffset,
      topOffset,
      dividerHeight
    })
    : getMobileSheetPosition({
      height: viewportHeight,
      mode: sheetMode,
      dragOffset,
      topOffset,
      collapsedHandleHeight: dividerHeight
    });

  return {
    mapHeight: sheetPosition,
    itineraryHeight: Math.max(0, viewportHeight - sheetPosition),
    sheetPosition
  };
};

export const getSplitViewGridRows = (options) => {
  const { mapHeight, itineraryHeight } = getSplitPaneLayout(options);
  return `${mapHeight}px ${itineraryHeight}px`;
};
