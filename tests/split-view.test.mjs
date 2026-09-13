import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DISPLAY_MODES,
  getFreeSplitPanePosition,
  getSplitPaneLayout,
  getSplitViewGridRows,
  normalizeDisplayMode
} from '../src/splitView.js';

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
