import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from '@babel/parser';
import postcss from 'postcss';
import { createServer } from 'vite';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
const stylesheet = postcss.parse(fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8'));
let viteServer;
let ScrollTimeInput;

before(async () => {
  viteServer = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: projectRoot,
    server: { middlewareMode: true }
  });
  ({ ScrollTimeInput } = await viteServer.ssrLoadModule('/src/App.jsx'));
});

after(async () => {
  delete globalThis.window;
  await viteServer?.close();
});

const jsxAttribute = (element, name) => element.attributes.find(attribute => (
  attribute.type === 'JSXAttribute' && attribute.name.name === name
));

const jsxStringValue = (attribute) => attribute?.value?.type === 'StringLiteral'
  ? attribute.value.value
  : null;

const collectScrollTimeInputs = (node, matches = []) => {
  if (!node || typeof node !== 'object') return matches;
  if (Array.isArray(node)) {
    node.forEach(child => collectScrollTimeInputs(child, matches));
    return matches;
  }
  if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && node.name.name === 'ScrollTimeInput') {
    matches.push(node);
  }
  Object.entries(node).forEach(([key, value]) => {
    if (!['loc', 'start', 'end', 'tokens', 'comments'].includes(key)) collectScrollTimeInputs(value, matches);
  });
  return matches;
};

const findRule = (selector) => stylesheet.nodes.find(node => node.type === 'rule' && node.selector === selector);
const declaration = (rule, property) => rule?.nodes.find(node => node.type === 'decl' && node.prop === property)?.value;

test('applies the expense theme only to expense time pickers, not itinerary editing', () => {
  const ast = parse(appSource, { sourceType: 'module', plugins: ['jsx'] });
  const inputs = collectScrollTimeInputs(ast);
  const expenseInputs = inputs.filter(input => jsxStringValue(jsxAttribute(input, 'label')) === '소비 시간');
  const itineraryInput = inputs.find(input => jsxStringValue(jsxAttribute(input, 'label')) === '일정 시간 선택');

  assert.equal(expenseInputs.length, 2, 'expense add and edit each have a time picker');
  assert.deepEqual(expenseInputs.map(input => jsxStringValue(jsxAttribute(input, 'variant'))), ['expense', 'expense']);
  assert.ok(itineraryInput, 'itinerary editing keeps its own time picker');
  assert.equal(jsxStringValue(jsxAttribute(itineraryInput, 'variant')), null);
});

test('renders a scoped variant class without changing the default time picker', () => {
  assert.equal(typeof ScrollTimeInput, 'function', 'the real time picker can be rendered');
  globalThis.window = { innerWidth: 430 };

  const props = { value: '20:40', onChange() {}, label: '소비 시간', compact: true };
  const expenseMarkup = renderToStaticMarkup(React.createElement(ScrollTimeInput, { ...props, variant: 'expense' }));
  const defaultMarkup = renderToStaticMarkup(React.createElement(ScrollTimeInput, props));

  assert.match(expenseMarkup, /class="expense-time-picker expense-time-picker--expense"/);
  assert.match(expenseMarkup, /aria-label="소비 시간 오후 08:40"/);
  assert.match(defaultMarkup, /class="expense-time-picker"/);
  assert.doesNotMatch(defaultMarkup, /expense-time-picker--expense/);
});

test('defines mint-teal color tokens only for the expense time picker variant', () => {
  const defaultTheme = findRule('.expense-time-picker');
  const expenseTheme = findRule('.expense-time-picker--expense');

  assert.equal(declaration(defaultTheme, '--time-picker-accent'), '#2563eb');
  assert.equal(declaration(defaultTheme, '--time-picker-wheel-background'), '#eef4ff');
  assert.equal(declaration(expenseTheme, '--time-picker-accent'), '#0f766e');
  assert.equal(declaration(expenseTheme, '--time-picker-accent-soft'), '#ccfbf1');
  assert.equal(declaration(expenseTheme, '--time-picker-wheel-background'), '#f0fdf9');
  assert.equal(declaration(expenseTheme, '--time-picker-popover-border'), '#99f6e4');
  assert.match(appSource, /var\(--time-picker-accent\)/);
  assert.match(appSource, /var\(--time-picker-accent-soft\)/);
  assert.match(appSource, /var\(--time-picker-wheel-background\)/);
  assert.match(appSource, /var\(--time-picker-popover-border\)/);
});
