import assert from 'node:assert/strict';
import test from 'node:test';

import {
  flushPendingMapCameraAction,
  runOrQueueMapCameraAction,
  shouldRenderMapPane
} from '../src/mapPanePresentation.js';

test('shouldRenderMapPane follows desktop and mobile map visibility policy', () => {
  assert.equal(shouldRenderMapPane({ isBottomNavigationViewport: false, mapVisible: false }), true);
  assert.equal(shouldRenderMapPane({ isBottomNavigationViewport: true, mapVisible: true }), true);
  assert.equal(shouldRenderMapPane({ isBottomNavigationViewport: true, mapVisible: false }), false);
});

test('runs camera actions immediately and flushes latest queued action once', () => {
  const calls = [];
  const map = {
    panTo: (position) => calls.push(['panTo', position]),
    setZoom: (zoom) => calls.push(['setZoom', zoom])
  };
  const mapRef = { current: map };
  const pendingActionRef = { current: null };
  const immediatePosition = { lat: 35.1, lng: 139.2 };

  assert.equal(runOrQueueMapCameraAction(
    mapRef,
    pendingActionRef,
    currentMap => currentMap.panTo(immediatePosition)
  ), true);
  assert.deepEqual(calls, [['panTo', immediatePosition]]);

  mapRef.current = null;
  const stalePosition = { lat: 1, lng: 2 };
  const desiredPosition = { lat: 37.5, lng: 127.0 };
  assert.equal(runOrQueueMapCameraAction(
    mapRef,
    pendingActionRef,
    currentMap => currentMap.panTo(stalePosition)
  ), false);
  assert.equal(runOrQueueMapCameraAction(
    mapRef,
    pendingActionRef,
    currentMap => {
      currentMap.panTo(desiredPosition);
      currentMap.setZoom(16);
    }
  ), false);

  assert.equal(flushPendingMapCameraAction(map, mapRef, pendingActionRef), true);
  assert.equal(mapRef.current, map);
  assert.deepEqual(calls, [
    ['panTo', immediatePosition],
    ['panTo', desiredPosition],
    ['setZoom', 16]
  ]);
  assert.equal(pendingActionRef.current, null);
  assert.equal(flushPendingMapCameraAction(map, mapRef, pendingActionRef), false);
  assert.equal(calls.length, 3);
});
