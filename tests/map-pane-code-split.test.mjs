import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
const appStaticImports = appSource.split('\n').filter(line => /^\s*import\b/.test(line)).join('\n');
let viteServer;
let MapPaneErrorBoundary;
let boundaryLoadError;

before(async () => {
  viteServer = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: projectRoot,
    server: { middlewareMode: true }
  });

  try {
    ({ default: MapPaneErrorBoundary } = await viteServer.ssrLoadModule('/src/MapPaneErrorBoundary.jsx'));
  } catch (error) {
    boundaryLoadError = error;
  }
});

after(async () => {
  await viteServer?.close();
});

test('App keeps Google Maps out of its static imports and lazy-loads MapPane', () => {
  assert.equal(/@react-google-maps\/api/.test(appStaticImports), false, 'App has no static Google Maps package import');
  assert.ok(/lazy\(\(\)\s*=>\s*import\(['"]\.\/MapPane\.jsx['"]\)\)/.test(appSource), 'App lazy-imports MapPane');
  assert.ok(/<MapPaneErrorBoundary[\s\S]*?<Suspense[\s\S]*?<LazyMapPane/.test(appSource), 'MapPane is protected by its error and suspense boundaries');
});

test('MapPane owns the Google loader and existing map availability UI', () => {
  const mapPanePath = path.join(projectRoot, 'src/MapPane.jsx');
  assert.ok(fs.existsSync(mapPanePath), 'MapPane module exists');
  const mapPaneSource = fs.readFileSync(mapPanePath, 'utf8');
  assert.match(mapPaneSource, /useJsApiLoader/);
  assert.match(mapPaneSource, /getMapAvailability/);
  assert.match(mapPaneSource, /지도 API 키가 없습니다|지도 없이도 일정, 즐겨찾기, 예산 기능은 사용할 수 있습니다\./);
});

test('App flushes queued focus on map load and clears its map handle on unmount', () => {
  assert.ok(/onMapLoad:\s*\(loadedMap\)\s*=>\s*\{\s*flushPendingMapCameraAction\(loadedMap, mapRef, pendingMapCameraActionRef\);\s*setMap\(loadedMap\);/.test(appSource));
  assert.ok(/onMapUnmount:\s*\(\)\s*=>\s*\{\s*mapRef\.current = null;\s*setMap\(null\);\s*\}/.test(appSource));
});

test('MapPaneErrorBoundary exposes a localized failure state', () => {
  assert.ok(MapPaneErrorBoundary, `MapPaneErrorBoundary must load: ${boundaryLoadError?.message || 'missing export'}`);
  assert.deepEqual(
    MapPaneErrorBoundary.getDerivedStateFromError(new Error('chunk failed')),
    { hasError: true }
  );
});
