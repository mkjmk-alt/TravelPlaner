import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createNearbyOrderPreview } from '../src/itineraryOrder.js';

let server;
let Content;
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try { ({ NearbyOrderPreviewContent: Content } = await server.ssrLoadModule('/src/NearbyOrderPreview.jsx')); } catch { /* Assert unavailable UI behavior below. */ }
});
after(async () => server?.close());
const buttons = node => React.isValidElement(node)
  ? node.type === 'button' ? [node] : React.Children.toArray(node.props.children).flatMap(buttons)
  : [];
const preview = () => createNearbyOrderPreview({ day: 1, items: [
  { id: 'a', name: '호텔', lat: 0, lng: 0, time: '09:00' },
  { id: 'c', name: '관광지', lat: 0, lng: 3, time: '10:00' },
  { id: 'b', name: '식당', lat: 0, lng: 1, time: '11:00' }
] });

test('shows the proposed sequence with untouched times and applies only after explicit confirmation', () => {
  assert.ok(Content, 'The preview UI must exist');
  const calls = [];
  const props = { preview: preview(), onApply: () => calls.push('apply'), onCancel: () => calls.push('cancel') };
  const markup = renderToStaticMarkup(React.createElement(Content, props));
  const order = markup.indexOf('호텔') < markup.indexOf('식당') && markup.indexOf('식당') < markup.indexOf('관광지');
  assert.ok(order, 'The visible preview must show the new order');
  assert.match(markup, /11:00/);
  assert.match(markup, /도착 시간/);
  assert.match(markup, /직선/);
  assert.deepEqual(calls, [], 'Rendering the preview must not save it');
  const controls = buttons(Content(props));
  controls.find(button => button.props['data-action'] === 'apply').props.onClick();
  controls.find(button => button.props['data-action'] === 'cancel').props.onClick();
  assert.deepEqual(calls, ['apply', 'cancel']);
});

test('blocks confirmation when the day changed while reviewing the preview', () => {
  assert.ok(Content, 'The preview UI must exist');
  const calls = [];
  const props = { preview: preview(), blockedReason: '일정이 변경되었습니다. 다시 정렬해주세요.', onApply: () => calls.push('apply'), onCancel: () => {} };
  const apply = buttons(Content(props)).find(button => button.props['data-action'] === 'apply');
  assert.equal(apply.props.disabled, true);
  apply.props.onClick();
  assert.deepEqual(calls, []);
  assert.match(renderToStaticMarkup(React.createElement(Content, props)), /일정이 변경/);
});

test('explains an unchanged order and protects unknown-location schedule entries', () => {
  assert.ok(Content, 'The preview UI must exist');
  const same = createNearbyOrderPreview({ day: 1, items: [
    { id: 'a', name: '호텔', lat: 0, lng: 0 },
    { id: 'note', name: '예약 메모' },
    { id: 'b', name: '식당', lat: 0, lng: 1 },
    { id: 'c', name: '관광지', lat: 0, lng: 3 }
  ] });
  const props = { preview: same, onApply: () => assert.fail('Unchanged preview must not apply'), onCancel: () => {} };
  assert.equal(buttons(Content(props)).find(button => button.props['data-action'] === 'apply').props.disabled, true);
  const markup = renderToStaticMarkup(React.createElement(Content, props));
  assert.match(markup, /이미 가까운 순서/);
  assert.match(markup, /예약 메모/);
  assert.match(markup, /위치 정보 없는/);
});
