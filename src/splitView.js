import { getMobileSheetPosition } from './mobileSheet.js';

export const DISPLAY_MODES = Object.freeze({
  CLASSIC: 'classic',
  SPLIT: 'split'
});

export const SPLIT_VIEW_MIN_PANE_HEIGHT = 96;

export const normalizeDisplayMode = (mode) => (
  mode === DISPLAY_MODES.SPLIT ? DISPLAY_MODES.SPLIT : DISPLAY_MODES.CLASSIC
);

export const getResponsiveDisplayMode = ({ width, height, isCoarsePointer = false }) => {
  const viewportWidth = Math.max(0, Number(width) || 0);
  const viewportHeight = Math.max(0, Number(height) || 0);
  const isPortrait = viewportHeight > viewportWidth;
  const isPortraitTablet = isPortrait && viewportWidth <= 1024;
  const isPhoneLandscape = (
    !isPortrait
    && isCoarsePointer
    && viewportHeight <= 500
    && viewportWidth <= 900
  );

  return isPortraitTablet || isPhoneLandscape
    ? DISPLAY_MODES.SPLIT
    : DISPLAY_MODES.CLASSIC;
};

export const getSidebarFooterVariant = (mode) => (
  normalizeDisplayMode(mode) === DISPLAY_MODES.SPLIT ? 'compact' : 'full'
);

export const getSplitViewScrollContainer = (mode) => (
  normalizeDisplayMode(mode) === DISPLAY_MODES.SPLIT ? 'sidebar' : 'list'
);

export const getFreeSplitPanePosition = ({
  height,
  position,
  dragOffset = 0,
  topOffset = 112,
  dividerHeight = SPLIT_VIEW_MIN_PANE_HEIGHT
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
  dividerHeight = SPLIT_VIEW_MIN_PANE_HEIGHT
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
