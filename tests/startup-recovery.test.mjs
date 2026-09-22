import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  STARTUP_TIMEOUT_MS,
  classifyStartupError,
  loadRuntimeConfig,
} from '../src/startupRecovery.js';

const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const recoverySource = readFileSync(new URL('../src/StartupRecoveryScreen.jsx', import.meta.url), 'utf8');

test('uses a bounded startup timeout and preserves offline fallback behavior', async () => {
  assert.equal(STARTUP_TIMEOUT_MS, 8000);

  const config = await loadRuntimeConfig(async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }), { timeoutMs: 5 });

  assert.deepEqual(config, {});
});

test('classifies startup failures without exposing a destructive recovery action', () => {
  assert.equal(classifyStartupError({ code: 'STARTUP_TIMEOUT' }), 'timeout');
  assert.equal(classifyStartupError(new TypeError('Failed to fetch')), 'offline');
  assert.equal(classifyStartupError(new TypeError("Cannot read properties of undefined")), 'app');
  assert.equal(classifyStartupError(new Error('ChunkLoadError: failed to load module')), 'app');
  assert.equal(classifyStartupError(new Error('unexpected server response')), 'app');
});

test('does not trust a non-JSON config response', async () => {
  const config = await loadRuntimeConfig(async () => ({
    ok: true,
    json: async () => { throw new SyntaxError('invalid json'); },
  }));

  assert.deepEqual(config, {});
});

test('boots through the bounded loader and renders a non-destructive recovery screen', () => {
  assert.match(mainSource, /loadRuntimeConfig\(\)/);
  assert.match(mainSource, /await import\('\.\/App\.jsx'\)/);
  assert.match(mainSource, /StartupRecoveryScreen/);
  assert.match(recoverySource, /onClick=\{\(\) => window\.location\.reload\(\)\}/);
  assert.doesNotMatch(`${mainSource}\n${recoverySource}`, /localStorage\.clear\(\)/);
});
