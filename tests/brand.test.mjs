import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BRAND_NAME_EN,
  BRAND_NAME_KO,
  BRAND_TITLE
} from '../src/brand.js';

test('defines the TripPlot brand for every display surface', () => {
  assert.equal(BRAND_NAME_KO, 'TripPlot');
  assert.equal(BRAND_NAME_EN, 'TripPlot');
  assert.equal(BRAND_TITLE, 'TripPlot');
});
