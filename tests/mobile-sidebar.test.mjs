import assert from 'node:assert/strict';
import test from 'node:test';

import { getMobileViewModeSheetMode } from '../src/mobileSidebar.js';

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
