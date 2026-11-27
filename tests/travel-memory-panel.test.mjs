import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { after, before } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = new URL('..', import.meta.url).pathname;
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const photo = 'data:image/png;base64,AA==';
const trip = {
  id: 'trip-1',
  startDate: '2026-09-10',
  endDate: '2026-09-12',
  travelDetails: { flightNumber: 'KE703' },
  lodgings: [{ id: 'hotel-1', name: '나리타 호텔', checkIn: '2026-09-10', checkOut: '2026-09-12' }],
  journalEntries: [
    { id: 'old', title: '예전 기록', place: { name: '좌표 미정', lat: null, lng: null } },
    { id: 'photo', date: '2026-09-15', title: '사진 기록', imageDataUrl: photo, place: { name: '공원', lat: 35, lng: 139, day: 1 } }
  ]
};

let server;
let TravelMemoryPanel;
let TripManagementPanel;
before(async () => {
  server = await createServer({ root: projectRoot, configFile: false, logLevel: 'silent', server: { middlewareMode: true } });
  ({ default: TravelMemoryPanel } = await server.ssrLoadModule('/src/TravelMemoryPanel.jsx'));
  ({ default: TripManagementPanel } = await server.ssrLoadModule('/src/TripManagementPanel.jsx'));
});

after(async () => {
  await server?.close();
});

const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, { trip, ...props }));

test('shows the album immediately with calendar filters and keeps management collapsed by default', () => {
  const markup = render(TravelMemoryPanel, { onUpdateTrip() {}, onOpenPlace() {} });
  assert.match(markup, /<details class="travel-memory-management">/);
  assert.match(markup, /항공·숙소 정보/);
  assert.match(markup, /나리타 호텔/);
  assert.match(markup, /aria-label="사진과 메모 앨범"/);
  assert.match(markup, /aria-pressed="true">전체 기록/);
  assert.match(markup, /title="2026-09-11"[^>]*aria-pressed="false"/);
  assert.match(markup, /title="2026-09-15"[^>]*aria-pressed="false"/);
  assert.match(markup, /aria-pressed="false">날짜 미정/);
  assert.match(markup, /<time dateTime="2026-09-15"/);
  assert.match(markup, /src="data:image\/png;base64,AA=="/);
  assert.match(markup, /기록 추가/);
  assert.match(markup, /예전 기록/);
  assert.equal([...markup.matchAll(/title="지도에서 장소 보기"/g)].length, 1);
  assert.doesNotMatch(markup, /기록 저장/);
});

test('renders an empty album and supports a parent-owned management destination', () => {
  const markup = render(TravelMemoryPanel, {
    trip: { id: 'empty' },
    onUpdateTrip() {},
    onOpenManagement() {}
  });
  assert.match(markup, /<button[^>]*travel-memory-management-link[^>]*>여행 관리/);
  assert.match(markup, /아직 여행 기록이 없습니다/);
  assert.doesNotMatch(markup, /<details|항공·숙소 정보/);
});

test('guards editing for shared trips even when mutation callbacks were supplied', () => {
  const markup = render(TravelMemoryPanel, {
    readOnly: true,
    onUpdateTrip: assert.fail,
    onOpenPlace() {},
    managementActions: { onOpenChecklist: assert.fail, onExportBackup() {}, onRestoreBackup: assert.fail }
  });
  assert.match(markup, /기록을 확인만 할 수 있습니다/);
  assert.match(markup, /<input[^>]*disabled=""[^>]*value="KE703"/);
  assert.match(markup, /나리타 호텔/);
  assert.match(markup, /예전 기록/);
  assert.match(markup, /여행 데이터 백업/);
  assert.doesNotMatch(markup, /기록 추가|기록 수정|기록 삭제|여행 정보 저장|숙소 추가|백업 복원|여행 준비 체크리스트/);
});

test('routes management actions to the parent callbacks without passing click events', () => {
  const calls = [];
  const action = name => (...args) => calls.push([name, args]);
  const panel = TripManagementPanel({
    trip,
    onOpenChecklist: action('checklist'),
    onExportBackup: action('export'),
    onRestoreBackup: action('restore')
  });
  const group = panel.props.children[0];
  for (const button of group.props.children) button.props.onClick({ type: 'click' });
  assert.deepEqual(calls, [['checklist', []], ['export', []], ['restore', []]]);
});

test('renders the existing checklist supplied by the parent only for editable trips', () => {
  const props = { onOpenChecklist() {}, checklist: React.createElement('p', null, '여권 확인') };
  const expanded = render(TripManagementPanel, props);
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /여권 확인/);
  assert.match(render(TripManagementPanel, { ...props, checklist: null }), /aria-expanded="false"/);
  assert.doesNotMatch(render(TripManagementPanel, { ...props, readOnly: true }), /여권 확인/);
});

test('passes a map focus callback into the travel memory panel', () => {
  assert.match(appSource, /viewMode === ['"]memory['"]/);
  assert.match(appSource, /onOpenPlace=\{openMemoryPlace\}/);
  assert.match(appSource, /setPendingMemoryMapFocus\(coordinates\)/);
  assert.match(appSource, /runOrQueueMapCameraAction\(mapRef, pendingMapCameraActionRef, \(activeMap\) => \{\s*activeMap\.panTo\(pendingMemoryMapFocus\);\s*activeMap\.setZoom\(16\);/);
});
