import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let MapRouteOptions;
const findInputs = element => {
  if (!React.isValidElement(element)) return [];
  if (element.type === 'input') return [element];
  return React.Children.toArray(element.props.children).flatMap(findInputs);
};

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ MapRouteOptions } = await server.ssrLoadModule('/src/MapRouteSettings.jsx'));
});
after(async () => server?.close());

test('switches connection modes while retaining the saved transport choice', () => {
  const changes = [];
  const settings = { mode: 'straight', travelMode: 'WALKING' };
  const options = MapRouteOptions({ settings, onChange: next => changes.push(next) });
  const inputs = findInputs(options);
  assert.deepEqual(inputs.map(input => [input.props['aria-label'], input.props.checked]), [['직선 연결', true], ['실제 길', false]]);
  inputs[1].props.onChange();
  assert.deepEqual(changes, [{ mode: 'road', travelMode: 'WALKING' }]);
  const markup = renderToStaticMarkup(React.createElement(MapRouteOptions, { settings, onChange: () => {} }));
  assert.doesNotMatch(markup, /이동 방법/);
});

test('changes the road transport without reverting the road mode', () => {
  const changes = [];
  const settings = { mode: 'road', travelMode: 'DRIVING' };
  const inputs = findInputs(MapRouteOptions({ settings, onChange: next => changes.push(next) }));
  const walking = inputs.find(input => input.props['aria-label'] === '도보');
  walking.props.onChange();
  assert.deepEqual(changes, [{ mode: 'road', travelMode: 'WALKING' }]);
  const driving = inputs.find(input => input.props['aria-label'] === '자동차');
  assert.equal(driving.props.checked, true);
});
