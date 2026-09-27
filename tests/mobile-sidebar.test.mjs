import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import postcss from 'postcss';

import {
  getBottomNavigationItems,
  getBottomNavigationSelection,
  getMobileViewModeSheetMode
} from '../src/mobileSidebar.js';

test('provides the five primary destinations in a stable order', () => {
  assert.deepEqual(
    getBottomNavigationItems(),
    [
      { key: 'trips', label: '내 여행' },
      { key: 'favorites', label: '저장' },
      { key: 'budget', label: '예산·지출' },
      { key: 'memory', label: '여행 기록' },
      { key: 'more', label: '더보기' }
    ]
  );
});

test('maps bottom navigation selections to the correct root screen behavior', () => {
  const selections = [
    ['trips', { rootTab: 'trips', viewMode: 'trips', showSidebar: true }],
    ['favorites', { rootTab: 'favorites', viewMode: 'favorites', showSidebar: true }],
    ['budget', { rootTab: 'budget', viewMode: 'budget', showSidebar: true }],
    ['memory', { rootTab: 'memory', viewMode: 'memory', showSidebar: true }],
    ['more', { rootTab: 'more', viewMode: 'more', showSidebar: true }]
  ];

  for (const [key, expected] of selections) {
    assert.deepEqual(getBottomNavigationSelection(key), expected);
  }

  assert.deepEqual(getBottomNavigationSelection('map'), {
    rootTab: 'trips', viewMode: 'trips', showSidebar: true
  });
  assert.deepEqual(getBottomNavigationSelection('unknown'), {
    rootTab: 'trips',
    viewMode: 'trips',
    showSidebar: true
  });
});

test('opens saved places in the full mobile panel so the list can scroll', () => {
  assert.equal(
    getMobileViewModeSheetMode({ viewMode: 'favorites', viewportWidth: 430, currentMode: 'half' }),
    'full'
  );
});

test('does not change the sheet mode for saved places on desktop', () => {
  assert.equal(
    getMobileViewModeSheetMode({ viewMode: 'favorites', viewportWidth: 1207, currentMode: 'half' }),
    'half'
  );
});

test('keeps the five-column mobile bar touchable and inside the device safe area', () => {
  const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
  const stylesheet = postcss.parse(fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8'));
  let navigationRule;
  let itemRule;

  stylesheet.walkAtRules('media', mediaRule => {
    if (!mediaRule.params.includes('max-width: 1024px')) return;
    mediaRule.walkRules(rule => {
      if (rule.selector === '.mobile-bottom-navigation') navigationRule = rule;
      if (rule.selector === '.mobile-bottom-navigation-item') itemRule = rule;
    });
  });

  const declaration = (rule, property) => rule?.nodes.find(node => node.prop === property)?.value;
  assert.equal(declaration(navigationRule, 'grid-template-columns'), 'repeat(5, minmax(0, 1fr))');
  assert.match(declaration(navigationRule, 'padding'), /env\(safe-area-inset-bottom\)/);
  assert.equal(declaration(itemRule, 'min-height'), '48px');
});

test('reduces bottom-navigation label sizing on very narrow phones', () => {
  const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
  const stylesheet = postcss.parse(fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8'));
  let labelRule;

  stylesheet.walkAtRules('media', mediaRule => {
    if (!mediaRule.params.includes('max-width: 380px')) return;
    mediaRule.walkRules(rule => {
      if (rule.selector === '.mobile-bottom-navigation-item span') labelRule = rule;
    });
  });

  const fontSize = labelRule?.nodes.find(node => node.prop === 'font-size')?.value;
  assert.ok(fontSize, 'narrow viewport label font size should be explicitly tuned');
  assert.ok(Number.parseFloat(fontSize) < 10, `expected a compact font size, received ${fontSize}`);
});
