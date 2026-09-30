import assert from 'node:assert/strict';
import test, { before } from 'node:test';

let snapshot;
before(async () => {
  try { snapshot = await import('../src/mapSnapshot.js'); } catch { /* Check missing behavior below. */ }
});

test('bounds large map exports to avoid mobile canvas memory limits', () => {
  assert.ok(snapshot, 'Map snapshot implementation must exist');
  for (const [width, height] of [[430, 400], [1920, 1080], [3000, 3000], [10000, 1000]]) {
    const scale = snapshot.getMapCaptureScale(width, height);
    assert.ok(scale > 0 && scale <= 2);
    assert.ok(width * scale <= 2048 && height * scale <= 2048);
    assert.ok(width * height * scale ** 2 <= 3000000.001);
  }
});

test('rejects a hidden map instead of exporting an empty image', () => {
  assert.ok(snapshot, 'Map snapshot implementation must exist');
  for (const [width, height] of [[0, 400], [430, 0], [-1, 400], [NaN, 400], [Infinity, 400]]) {
    assert.throws(() => snapshot.getMapCaptureScale(width, height));
  }
});
