import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DISPLAY_MODES,
  getFreeSplitPanePosition,
  getResponsiveDisplayMode,
  getSidebarFooterVariant,
  getSplitPaneLayout,
  getSplitViewScrollContainer,
  getSplitViewGridRows,
  normalizeDisplayMode
} from '../src/splitView.js';

test('selects classic on desktop and tablet landscape, split on mobile and tablet portrait', () => {
  assert.equal(getResponsiveDisplayMode({ width: 1440, height: 900 }), DISPLAY_MODES.CLASSIC);
  assert.equal(getResponsiveDisplayMode({ width: 1024, height: 768 }), DISPLAY_MODES.CLASSIC);
  assert.equal(getResponsiveDisplayMode({ width: 390, height: 844 }), DISPLAY_MODES.SPLIT);
  assert.equal(getResponsiveDisplayMode({ width: 820, height: 1180 }), DISPLAY_MODES.SPLIT);
  assert.equal(getResponsiveDisplayMode({ width: 1024, height: 1366 }), DISPLAY_MODES.SPLIT);
  assert.equal(getResponsiveDisplayMode({ width: 844, height: 390, isCoarsePointer: true }), DISPLAY_MODES.SPLIT);
});

test('uses the full footer in classic mode and compact status footer in split mode', () => {
  assert.equal(getSidebarFooterVariant(DISPLAY_MODES.CLASSIC), 'full');
  assert.equal(getSidebarFooterVariant(DISPLAY_MODES.SPLIT), 'compact');
  assert.equal(getSidebarFooterVariant('unknown'), 'full');
});

test('supports classic and split display modes with classic as the fallback', () => {
  assert.equal(normalizeDisplayMode(DISPLAY_MODES.CLASSIC), DISPLAY_MODES.CLASSIC);
  assert.equal(normalizeDisplayMode(DISPLAY_MODES.SPLIT), DISPLAY_MODES.SPLIT);
  assert.equal(normalizeDisplayMode('unknown'), DISPLAY_MODES.CLASSIC);
});

test('allocates the split view into map and itinerary panes', () => {
  assert.deepEqual(getSplitPaneLayout({ height: 800, sheetMode: 'half' }), {
    mapHeight: 400,
    itineraryHeight: 400,
    sheetPosition: 400
  });
});

test('keeps a handle-sized pane visible at the map and itinerary extremes', () => {
  assert.deepEqual(getSplitPaneLayout({ height: 800, sheetMode: 'collapsed' }), {
    mapHeight: 740,
    itineraryHeight: 60,
    sheetPosition: 740
  });
  assert.deepEqual(getSplitPaneLayout({ height: 800, sheetMode: 'full' }), {
    mapHeight: 112,
    itineraryHeight: 688,
    sheetPosition: 112
  });
});

test('uses explicit grid rows so split panes cannot overlap', () => {
  assert.equal(getSplitViewGridRows({ height: 800, sheetMode: 'half' }), '400px 400px');
});

test('scrolls the whole sidebar in split mode so the brand header moves with the itinerary', () => {
  assert.equal(getSplitViewScrollContainer(DISPLAY_MODES.SPLIT), 'sidebar');
  assert.equal(getSplitViewScrollContainer(DISPLAY_MODES.CLASSIC), 'list');
  assert.equal(getSplitViewScrollContainer('unknown'), 'list');
});

test('keeps a split divider at any released position instead of snapping it', () => {
  assert.equal(getFreeSplitPanePosition({ height: 800, position: 275 }), 275);
  assert.deepEqual(getSplitPaneLayout({ height: 800, position: 275 }), {
    mapHeight: 275,
    itineraryHeight: 525,
    sheetPosition: 275
  });
  assert.equal(getSplitViewGridRows({ height: 800, position: 275 }), '275px 525px');
});

test('clamps a free split divider to the visible pane limits', () => {
  assert.equal(getFreeSplitPanePosition({ height: 800, position: 275, dragOffset: -500 }), 112);
  assert.equal(getFreeSplitPanePosition({ height: 800, position: 275, dragOffset: 600 }), 740);
});
