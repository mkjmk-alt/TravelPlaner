import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('production build emits a versioned shell manifest with hashed app assets', () => {
  execFileSync('npm', ['run', 'build'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'pipe',
  });

  const manifest = JSON.parse(read('dist/shell-assets.json'));
  assert.match(manifest.cacheName, /^travelplaner-shell-[a-f0-9]{12}$/);
  assert.ok(manifest.assets.some(asset => /^\/assets\/.*\.js$/.test(asset)));
  assert.ok(manifest.assets.some(asset => /^\/assets\/.*\.css$/.test(asset)));
});

test('service worker only uses the document fallback and never intercepts API responses', () => {
  const serviceWorker = read('public/sw.js');

  assert.match(serviceWorker, /request\.mode === 'navigate'/);
  assert.match(serviceWorker, /request\.destination === 'document'/);
  assert.match(serviceWorker, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(serviceWorker, /return cached \|\| caches\.match\('\/index\.html'\)/);
  assert.match(serviceWorker, /return cached \|\| Response\.error\(\)/);
});
