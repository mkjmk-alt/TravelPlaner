import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
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

test('renders compact place guidance and calls the trips action', () => {
  let actionCount = 0;
  const onGoToTrips = () => { actionCount += 1; };
  const props = { viewMode: 'place', compact: true, onGoToTrips };
  const markup = renderToStaticMarkup(React.createElement(TripRequiredEmptyState, props));
  const button = findButton(TripRequiredEmptyState(props));

  assert.match(markup, /class="trip-required-empty-state is-compact"/);
  assert.match(markup, /여행을 선택하면 일정에 추가할 수 있어요\./);
  assert.match(markup, /내 여행에서 여행을 선택하거나 새로 만든 뒤 장소를 다시 열어주세요\./);
  assert.ok(button, 'place guidance exposes a trips action');
  button.props.onClick();
  assert.equal(actionCount, 1);
});

test('renders a separate read-only explanation without a trip-selection action', () => {
  const props = { viewMode: 'place', compact: true, isReadOnlyTrip: true, onGoToTrips() {} };
  const markup = renderToStaticMarkup(React.createElement(TripRequiredEmptyState, props));

  assert.match(markup, /공유된 여행은 조회 전용이에요\./);
  assert.match(markup, /장소를 일정에 추가하려면 내 여행에서 편집 가능한 여행을 선택해주세요\./);
  assert.doesNotMatch(markup, /내 여행으로 이동/);
});

test('keeps accessible heading references distinct when place guidance coexists with a trip empty state', () => {
  const budgetMarkup = renderToStaticMarkup(React.createElement(TripRequiredEmptyState, { viewMode: 'budget' }));
  const placeMarkup = renderToStaticMarkup(React.createElement(TripRequiredEmptyState, { viewMode: 'place', compact: true }));
  const titleId = markup => markup.match(/aria-labelledby="([^"]+)"/)?.[1];
  const budgetTitleId = titleId(budgetMarkup);
  const placeTitleId = titleId(placeMarkup);

  assert.ok(budgetTitleId && placeTitleId, 'each state labels its heading');
  assert.notEqual(placeTitleId, budgetTitleId);
  assert.match(placeMarkup, new RegExp(`id="${placeTitleId}"`));
});

test('keeps place guidance compact instead of stretching the empty place panel', () => {
  const stylesheet = postcss.parse(fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));
  let compactCardRule;
  let compactPanelRule;
  let compactContentRule;
  let mobileCompactPanelRule;

  stylesheet.walkRules(rule => {
    if (rule.parent.type !== 'root') return;
    if (rule.selector === '.trip-required-empty-state.is-compact') compactCardRule = rule;
    if (rule.selector === '.mobile-place-add-panel.is-guidance') compactPanelRule = rule;
    if (rule.selector === '.mobile-place-add-panel.is-guidance .mobile-place-add-content') compactContentRule = rule;
  });
  stylesheet.walkAtRules('media', mediaRule => {
    if (!mediaRule.params.includes('max-width: 768px')) return;
    mediaRule.walkRules(rule => {
      if (rule.selector === '.mobile-place-add-panel.is-guidance') mobileCompactPanelRule = rule;
    });
  });

  const value = (rule, property) => rule?.nodes.find(node => node.prop === property)?.value;
  assert.equal(value(compactCardRule, 'width'), '100%');
  assert.equal(value(compactCardRule, 'padding'), '12px');
  assert.equal(value(compactPanelRule, 'height'), 'auto');
  assert.equal(value(compactContentRule, 'flex'), '0 1 auto');
  assert.equal(value(mobileCompactPanelRule, 'bottom'), 'auto');
});

test('renders nothing for views that do not require a selected trip', () => {
  assert.equal(TripRequiredEmptyState({ viewMode: 'trips', onGoToTrips() {} }), null);
});
