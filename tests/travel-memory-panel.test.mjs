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

test('connects journal drafts and saved entries to itinerary places', () => {
  assert.match(panelSource, /getItineraryPlaceOptions/);
  assert.match(panelSource, /placeKey/);
  assert.match(panelSource, /onOpenPlace/);
  assert.match(panelSource, /장소 연결/);
  assert.match(panelSource, /지도에서 장소 보기/);
});

test('organizes saved memories as a day-filtered chronological timeline', () => {
  assert.match(panelSource, /getJournalEntryDay/);
  assert.match(panelSource, /sortJournalEntriesForTimeline/);
  assert.match(panelSource, /journalDayFilter/);
  assert.match(panelSource, /전체 기록/);
  assert.match(panelSource, /날짜별 여행 기록/);
  assert.match(panelSource, /TIMELINE/);
});

test('passes a map focus callback into the travel memory panel', () => {
  assert.match(appSource, /onOpenPlace=\{openMemoryPlace\}/);
  assert.match(appSource, /map\.panTo\(\{ lat, lng \}\)/);
});
