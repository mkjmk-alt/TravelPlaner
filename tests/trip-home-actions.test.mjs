import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { createServer } from 'vite';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
let viteServer;
let TripHomeActions;
let componentLoadError;

before(async () => {
  viteServer = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: projectRoot,
    server: { middlewareMode: true }
  });

  try {
    ({ default: TripHomeActions } = await viteServer.ssrLoadModule('/src/TripHomeActions.jsx'));
  } catch (error) {
    componentLoadError = error;
  }
});

after(async () => {
  await viteServer?.close();
});

const textContent = (node) => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(textContent).join('');
};

const findButtons = (node) => {
  if (!React.isValidElement(node)) return [];
  if (node.type === 'button') return [node];
  return React.Children.toArray(node.props.children).flatMap(findButtons);
};

test('renders the three trip actions in order and preserves their callbacks', () => {
  assert.ok(TripHomeActions, `TripHomeActions must load: ${componentLoadError?.message || 'missing export'}`);
  const calls = [];
  const props = {
    onCreateNewTrip: () => calls.push('new-trip'),
    onCreateAiPlan: () => calls.push('ai-plan'),
    onJoinTrip: () => calls.push('join-trip')
  };
  const element = TripHomeActions(props);
  const markup = renderToStaticMarkup(React.createElement(TripHomeActions, props));
  const buttons = findButtons(element);

  assert.match(markup, /role="group"/);
  assert.deepEqual(buttons.map(button => button.props['aria-label']), ['새 여행 계획하기', 'AI로 일정 만들기', '참여하기']);
  assert.deepEqual(buttons.map(button => React.Children.toArray(button.props.children).filter(child => React.isValidElement(child) && child.type === 'span').map(child => textContent(child))), [
    ['새 여행 계획하기', '새 여행'],
    ['AI로 일정 만들기', 'AI 일정'],
    ['참여하기', '참여']
  ]);
  buttons.forEach(button => button.props.onClick());
  assert.deepEqual(calls, ['new-trip', 'ai-plan', 'join-trip']);
});

test('shows the install action only when the browser install prompt is available', () => {
  assert.ok(TripHomeActions, `TripHomeActions must load: ${componentLoadError?.message || 'missing export'}`);
  const onInstallApp = () => {};
  const withoutPrompt = findButtons(TripHomeActions({ onInstallApp }));
  const withPrompt = findButtons(TripHomeActions({ deferredInstallPrompt: {}, onInstallApp }));

  assert.equal(withoutPrompt.length, 3);
  assert.equal(withPrompt.length, 4);
  assert.match(textContent(withPrompt[3]), /앱으로 설치/);
});

test('places the shortcut group in the header and leaves the trip list without duplicate actions', () => {
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
  const headerStart = appSource.indexOf('className={"sidebar-header');
  const actionsPlacement = appSource.indexOf('<TripHomeActions', headerStart);
  const navigationRow = appSource.indexOf('className="sidebar-top-actions"', headerStart);
  const tripHeading = appSource.indexOf('<h2 className="menu-section-title" style={{ marginBottom: \'12px\' }}>내 여행</h2>');
  const tripList = appSource.indexOf('{(trips || []).length === 0 ?', tripHeading);

  assert.ok(headerStart >= 0, 'sidebar header exists');
  assert.ok(actionsPlacement > headerStart && actionsPlacement < navigationRow);
  assert.doesNotMatch(appSource, /className="trip-action-grid"/);
  assert.ok(tripHeading >= 0 && tripList > tripHeading);
  assert.match(appSource.slice(tripHeading, tripList), /<\/h2>\s*<\/div>\s*$/);
});

test('places actions beside TripPlot at 700px while preserving the narrow-header fallback', () => {
  const stylesheet = postcss.parse(fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8'));
  const rootRule = (selector) => stylesheet.nodes.find(node => node.type === 'rule' && node.selector === selector);
  const declaration = (rule, property) => rule?.nodes.find(node => node.prop === property)?.value;
  const containerType = declaration(rootRule('.sidebar-header'), 'container-type');
  const brandRow = rootRule('.sidebar-brand-auth-row--with-actions');
  const actions = rootRule('.trip-home-actions');
  const primary = rootRule('.trip-home-action--primary');
  const mobileFullLabel = rootRule('.trip-home-action-label-full');
  const mobileCompactLabel = rootRule('.trip-home-action-label-compact');
  let wideBrandRow;
  let wideActions;
  let wideActionButton;
  let wideFullLabel;
  let wideCompactLabel;
  let narrowBrandRow;
  let narrowActionButton;

  stylesheet.walkAtRules('container', container => {
    if (container.params === 'trip-header (min-width: 700px)') {
      container.walkRules(rule => {
        if (rule.selector === '.sidebar-brand-auth-row--with-actions') wideBrandRow = rule;
        if (rule.selector === '.trip-home-actions') wideActions = rule;
        if (rule.selector === '.trip-home-action') wideActionButton = rule;
        if (rule.selector === '.trip-home-action-label-full') wideFullLabel = rule;
        if (rule.selector === '.trip-home-action-label-compact') wideCompactLabel = rule;
      });
    }
    if (container.params === 'trip-header (max-width: 380px)') {
      container.walkRules(rule => {
        if (rule.selector === '.sidebar-brand-auth-row--with-actions') narrowBrandRow = rule;
        if (rule.selector === '.trip-home-action') narrowActionButton = rule;
      });
    }
  });

  assert.equal(containerType, 'inline-size');
  assert.match(declaration(brandRow, 'grid-template-areas'), /"brand auth"\s+"brand actions"/);
  assert.match(declaration(brandRow, 'grid-template-columns'), /minmax\(92px, 1fr\)\s+minmax\(0, 1\.35fr\)/);
  assert.equal(declaration(actions, 'display'), 'grid');
  assert.equal(declaration(primary, 'grid-column'), '1 / -1');
  assert.equal(declaration(mobileFullLabel, 'display'), 'none');
  assert.equal(declaration(mobileCompactLabel, 'display'), 'inline');
  assert.match(declaration(wideBrandRow, 'grid-template-areas'), /"brand actions auth"/);
  assert.equal(declaration(wideActions, 'display'), 'flex');
  assert.equal(declaration(wideActions, 'flex-wrap'), 'wrap');
  assert.equal(declaration(wideActionButton, 'min-height'), '38px');
  assert.equal(declaration(wideActionButton, 'padding'), '6px 8px');
  assert.equal(declaration(wideFullLabel, 'display'), 'inline');
  assert.equal(declaration(wideCompactLabel, 'display'), 'none');
  assert.ok(narrowBrandRow, 'very narrow screens have an additional compact-header fallback');
  assert.equal(declaration(narrowActionButton, 'font-size'), '9px');
});
