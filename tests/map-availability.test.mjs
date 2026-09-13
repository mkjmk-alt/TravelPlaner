import assert from 'node:assert/strict';
import test from 'node:test';

import { getMapAvailability } from '../src/mapAvailability.js';

test('keeps the app available when the Google Maps API key is missing', () => {
  assert.deepEqual(
    getMapAvailability({ apiKey: '', isLoaded: false, loadError: null }),
    {
      appAvailable: true,
      mapAvailable: false,
      reason: 'missing-key',
      title: '지도 API 키가 없습니다'
    }
  );
});

test('keeps the app available when Google Maps loading fails', () => {
  assert.deepEqual(
    getMapAvailability({ apiKey: 'configured-key', isLoaded: false, loadError: new Error('기한이 만료된 API 키') }),
    {
      appAvailable: true,
      mapAvailable: false,
      reason: 'load-error',
      title: '지도를 불러오지 못했습니다',
      detail: '기한이 만료된 API 키'
    }
  );
});

test('marks the map as ready only after the loader completes', () => {
  assert.deepEqual(
    getMapAvailability({ apiKey: 'configured-key', isLoaded: true, loadError: null }),
    {
      appAvailable: true,
      mapAvailable: true,
      reason: null,
      title: '',
      detail: ''
    }
  );
});
