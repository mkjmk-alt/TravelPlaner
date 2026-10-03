import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: projectRoot });

test('does not lint another checkout or its generated files inside a Git worktree', async () => {
  for (const path of [
    '.worktrees/mobile-bottom-navigation/src/App.jsx',
    '.worktrees/mobile-bottom-navigation/dist/assets/App-B-kg8GWS.js',
    '.worktrees/mobile-bottom-navigation/apps/mobile/babel.config.js'
  ]) {
    assert.equal(await eslint.isPathIgnored(`${projectRoot}/${path}`), true, path);
  }
});

test('does not lint generated dist files even when they are nested in another directory', async () => {
  assert.equal(await eslint.isPathIgnored(`${projectRoot}/docs/generated/dist/example.js`), true);
});

test('still reports real code errors in the active web source', async () => {
  assert.equal(await eslint.isPathIgnored(`${projectRoot}/src/App.jsx`), false);
  const [result] = await eslint.lintText('const accidentalUnused = 1;', {
    filePath: `${projectRoot}/src/lint-scope-probe.jsx`
  });
  assert.equal(result.errorCount, 1);
  assert.equal(result.messages[0].ruleId, 'no-unused-vars');
});
