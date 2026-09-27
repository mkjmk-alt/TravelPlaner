import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getBottomNavigationItems,
  getBottomNavigationSelection,
  getMobileViewModeSheetMode
} from '../src/mobileSidebar.js';

test('provides the five primary destinations in a stable order', () => {
  assert.deepEqual(
    getBottomNavigationItems(),
    [
      { key: 'trips', label: '내 여행' },
      { key: 'favorites', label: '저장' },
      { key: 'budget', label: '예산·지출' },
      { key: 'memory', label: '여행 기록' },
      { key: 'more', label: '더보기' }
    ]
  );
});

test('maps bottom navigation selections to the correct root screen behavior', () => {
  const selections = [
    ['trips', { rootTab: 'trips', viewMode: 'trips', showSidebar: true }],
    ['favorites', { rootTab: 'favorites', viewMode: 'favorites', showSidebar: true }],
    ['budget', { rootTab: 'budget', viewMode: 'budget', showSidebar: true }],
    ['memory', { rootTab: 'memory', viewMode: 'memory', showSidebar: true }],
    ['more', { rootTab: 'more', viewMode: 'more', showSidebar: true }]
  ];

  for (const [key, expected] of selections) {
    assert.deepEqual(getBottomNavigationSelection(key), expected);
  }

  assert.deepEqual(getBottomNavigationSelection('map'), {
    rootTab: 'trips', viewMode: 'trips', showSidebar: true
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
