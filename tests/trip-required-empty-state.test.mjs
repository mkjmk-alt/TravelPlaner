import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = new URL('..', import.meta.url).pathname;
let viteServer;
let TripRequiredEmptyState;

before(async () => {
  viteServer = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: projectRoot,
    server: { middlewareMode: true }
  });
  ({ default: TripRequiredEmptyState } = await viteServer.ssrLoadModule('/src/TripRequiredEmptyState.jsx'));
});

after(async () => {
  await viteServer?.close();
});

const findButton = (node) => {
  if (!React.isValidElement(node)) return null;
  if (node.type === 'button') return node;
  return React.Children.toArray(node.props.children).map(findButton).find(Boolean) || null;
};

test('renders a useful trip-required state and its action returns to trips', () => {
  for (const [viewMode, title, message] of [
    ['budget', '예산·지출', '여행을 선택하면 예산과 지출을 관리할 수 있어요.'],
    ['memory', '여행 기록', '여행을 선택하면 여행 기록을 확인할 수 있어요.']
  ]) {
    let actionCount = 0;
    const onGoToTrips = () => { actionCount += 1; };
    const element = React.createElement(TripRequiredEmptyState, { viewMode, onGoToTrips });
    const markup = renderToStaticMarkup(element);
    const button = findButton(TripRequiredEmptyState({ viewMode, onGoToTrips }));

    assert.match(markup, new RegExp(title));
    assert.match(markup, new RegExp(message));
    assert.match(markup, /내 여행으로 이동/);
    assert.ok(button, 'empty state exposes a real button element');
    button.props.onClick();
    assert.equal(actionCount, 1);
  }
});

test('renders nothing for views that do not require a selected trip', () => {
  assert.equal(TripRequiredEmptyState({ viewMode: 'trips', onGoToTrips() {} }), null);
});
