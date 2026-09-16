import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBottomNavigationItems,
  getBottomNavigationSelection,
  getMobileViewModeSheetMode
} from '../src/mobileSidebar.js';

test('provides the four primary destinations in a stable order', () => {
  assert.deepEqual(
    getBottomNavigationItems(),
    [
      { key: 'trips', label: '내 여행' },
      { key: 'map', label: '지도' },
      { key: 'favorites', label: '저장' },
      { key: 'more', label: '더보기' }
    ]
  );
});

test('maps bottom navigation selections to the correct root screen behavior', () => {
  assert.deepEqual(getBottomNavigationSelection('map'), {
    rootTab: 'map',
    viewMode: 'trips',
    showSidebar: false
  });
  assert.deepEqual(getBottomNavigationSelection('favorites'), {
    rootTab: 'favorites',
    viewMode: 'favorites',
    showSidebar: true
  });
  assert.deepEqual(getBottomNavigationSelection('more'), {
    rootTab: 'more',
    viewMode: 'more',
    showSidebar: true
  });
  assert.deepEqual(getBottomNavigationSelection('unknown'), {
    rootTab: 'trips',
    viewMode: 'trips',
    showSidebar: true
  });
});

test('opens saved places in the full mobile panel so the list can scroll', () => {
  assert.equal(
    getMobileViewModeSheetMode({ viewMode: 'favorites', viewportWidth: 430, currentMode: 'half' }),
    'full'
  );
});

test('does not change the sheet mode for saved places on desktop', () => {
  assert.equal(
    getMobileViewModeSheetMode({ viewMode: 'favorites', viewportWidth: 1207, currentMode: 'half' }),
    'half'
  );
});
