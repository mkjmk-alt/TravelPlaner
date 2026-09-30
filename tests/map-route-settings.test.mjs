import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server;
let MapRouteOptions;
let RouteViewOptions;
let ItineraryRouteSettings;
let RouteFeedback;
const findInputs = element => {
  if (!React.isValidElement(element)) return [];
  if (element.type === 'input') return [element];
  return React.Children.toArray(element.props.children).flatMap(findInputs);
};

before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ MapRouteOptions, RouteViewOptions, RouteFeedback, default: ItineraryRouteSettings } = await server.ssrLoadModule('/src/MapRouteSettings.jsx'));
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

test('changes the visible day range without changing connection mode or transport', () => {
  assert.equal(typeof RouteViewOptions, 'function', 'The itinerary settings must expose the displayed range');
  const changes = [];
  const inputs = findInputs(RouteViewOptions({ showFullRoute: false, onChange: value => changes.push(value) }));
  assert.deepEqual(inputs.map(input => [input.props['aria-label'], input.props.checked]), [['현재 일차', true], ['전체 일정', false]]);
  inputs[1].props.onChange();
  assert.deepEqual(changes, [true]);
  const fullInputs = findInputs(RouteViewOptions({ showFullRoute: true, onChange: value => changes.push(value) }));
  fullInputs[0].props.onChange();
  assert.deepEqual(changes, [true, false]);
});

test('shows the current route choice beside the itinerary heading before opening any settings', () => {
  const settings = { mode: 'road', travelMode: 'WALKING' };
  const markup = renderToStaticMarkup(React.createElement(ItineraryRouteSettings, {
    settings, onChange: () => {}, showFullRoute: true, onShowFullRouteChange: () => {},
    routeState: { status: 'ready', total: 2, failures: [], warnings: [], error: null }
  }));
  assert.match(markup, /<h2[^>]*>내 일정<\/h2>/);
  assert.match(markup, /경로: 실제 길 · 도보/);
  assert.match(markup, /전체 일정/);
  assert.match(markup, /aria-expanded="false"/);
});

test('does not report a connected road route before the map is ready', () => {
  assert.equal(typeof RouteFeedback, 'function', 'Route feedback must be available in the itinerary settings');
  const markup = renderToStaticMarkup(React.createElement(RouteFeedback, {
    settings: { mode: 'road', travelMode: 'DRIVING' }, onChange: () => {},
    routeState: { status: 'idle', total: 2, failures: [], warnings: [], error: null }
  }));
  assert.doesNotMatch(markup, /구간을 연결했/);
  assert.match(markup, /지도.*준비/);
});

test('guides the user to select a day instead of claiming existing places are missing', () => {
  const markup = renderToStaticMarkup(React.createElement(RouteFeedback, {
    settings: { mode: 'road', travelMode: 'DRIVING' }, onChange: () => {},
    hasSelectedDay: false, showFullRoute: false,
    routeState: { status: 'idle', total: 0, failures: [], warnings: [], error: null }
  }));
  assert.match(markup, /일차.*선택.*전체 일정/);
  assert.doesNotMatch(markup, /장소를 2개 이상 추가/);
});

test('makes an unselected day visible in the collapsed route setting', () => {
  const markup = renderToStaticMarkup(React.createElement(ItineraryRouteSettings, {
    settings: { mode: 'straight', travelMode: 'DRIVING' }, onChange: () => {},
    hasSelectedDay: false, showFullRoute: false, onShowFullRouteChange: () => {},
    routeState: { status: 'idle', total: 0, failures: [], warnings: [], error: null }
  }));
  assert.match(markup, /일차 선택 필요/);
});
