import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
const panelSource = fs.existsSync(path.join(projectRoot, 'src/TravelMemoryPanel.jsx'))
  ? fs.readFileSync(path.join(projectRoot, 'src/TravelMemoryPanel.jsx'), 'utf8')
  : '';

test('exposes a separate travel memory view without deferred features', () => {
  assert.match(appSource, /TravelMemoryPanel/);
  assert.match(appSource, /viewMode === ['"]memory['"]/);
  assert.match(panelSource, /여행 기록/);
  assert.match(panelSource, /항공·숙소 정보/);
  assert.doesNotMatch(panelSource, /음성 메모|예약 링크|방문 국가 색칠/);
});
