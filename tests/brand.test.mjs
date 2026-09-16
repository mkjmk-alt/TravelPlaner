import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BRAND_NAME_EN,
  BRAND_NAME_KO,
  BRAND_TITLE
} from '../src/brand.js';

test('defines the Trip Plot brand for Korean and English surfaces', () => {
  assert.equal(BRAND_NAME_KO, '트립 플롯');
  assert.equal(BRAND_NAME_EN, 'Trip Plot');
  assert.equal(BRAND_TITLE, '트립 플롯 (Trip Plot)');
});
