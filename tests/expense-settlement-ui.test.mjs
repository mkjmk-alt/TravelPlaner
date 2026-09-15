import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
const stylesheetSource = fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8');

test('connects expense payer and participant data to add and edit flows', () => {
  assert.match(appSource, /normalizeExpenseParticipants/);
  assert.match(appSource, /payerId/);
  assert.match(appSource, /participantIds/);
  assert.match(appSource, /지출자/);
  assert.match(appSource, /함께 사용한 사람/);
});

test('exposes a settlement panel with participant management and transfer results', () => {
  assert.match(appSource, /calculateSettlement/);
  assert.match(appSource, /정산 참여자/);
  assert.match(appSource, /함께 정산/);
  assert.match(appSource, /누가 결제했는지/);
  assert.match(appSource, /누구에게 얼마를 보내면 되는지/);
  assert.match(stylesheetSource, /settlement-panel/);
});

test('shows payer and shared participant summary on saved expenses', () => {
  assert.match(appSource, /expense-participant-summary/);
  assert.match(appSource, /지출자/);
  assert.match(appSource, /함께 사용/);
});
