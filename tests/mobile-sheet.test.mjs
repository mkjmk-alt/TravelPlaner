import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getClosestMobileSheetMode,
  getMobileSheetPosition,
  getMobileSheetSnapPoints
} from '../src/mobileSheet.js';

test('creates map-full, half, and itinerary-full snap points', () => {
  assert.deepEqual(getMobileSheetSnapPoints(800), {
    full: 112,
    half: 400,
    collapsed: 740
  });
});

test('clamps a dragged sheet between the itinerary and map boundaries', () => {
  assert.equal(getMobileSheetPosition({ height: 800, mode: 'half', dragOffset: -500 }), 112);
  assert.equal(getMobileSheetPosition({ height: 800, mode: 'half', dragOffset: 500 }), 740);
});

test('snaps a released sheet to the nearest supported mode', () => {
  const snapPoints = getMobileSheetSnapPoints(800);
  assert.equal(getClosestMobileSheetMode(300, snapPoints), 'half');
  assert.equal(getClosestMobileSheetMode(700, snapPoints), 'collapsed');
});
