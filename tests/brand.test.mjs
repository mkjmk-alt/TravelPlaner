import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BRAND_NAME_EN,
  BRAND_NAME_KO,
  BRAND_TITLE
} from '../src/brand.js';

test('defines the Tribly brand for Korean and English surfaces', () => {
  assert.equal(BRAND_NAME_KO, '트리블리');
  assert.equal(BRAND_NAME_EN, 'Tribly');
  assert.equal(BRAND_TITLE, '트리블리 (Tribly)');
});
