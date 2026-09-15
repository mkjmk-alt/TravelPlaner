import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
const stylesheetSource = fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8');

test('does not ship the removed manual display mode controls', () => {
  assert.doesNotMatch(appSource, /sidebar-display-mode-(switch|indicator)/);
  assert.doesNotMatch(appSource, /자동 화면 모드|1번: 현재 화면|2번: 지도·일정 스플릿 뷰/);
  assert.doesNotMatch(stylesheetSource, /sidebar-display-mode-(switch|indicator)/);
});
