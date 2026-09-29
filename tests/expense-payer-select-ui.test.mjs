import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = new URL('..', import.meta.url).pathname;
let viteServer;
let ExpensePayerSelect;
let ExpensePayerSelectMenu;

before(async () => {
  viteServer = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: projectRoot,
    server: { middlewareMode: true }
  });
  ({ ExpensePayerSelect, ExpensePayerSelectMenu } = await viteServer.ssrLoadModule('/src/App.jsx'));
});

after(async () => {
  await viteServer?.close();
});

test('renders the selected payer as an accessible themed combobox trigger', () => {
  assert.equal(typeof ExpensePayerSelect, 'function', 'the payer field exposes a custom combobox');
  const markup = renderToStaticMarkup(React.createElement(ExpensePayerSelect, {
    id: 'test-payer',
    labelId: 'test-payer-label',
    ariaLabel: '지출자',
    options: [{ id: 'self', name: '나' }, { id: 'jisu', name: '지수' }],
    value: 'jisu',
    onChange() {}
  }));

  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-labelledby="test-payer-label test-payer-value"/);
  assert.match(markup, /지수/);
  assert.doesNotMatch(markup, /<select/);
});

test('renders selectable listbox options and emits the chosen participant id', () => {
  assert.equal(typeof ExpensePayerSelectMenu, 'function', 'the combobox uses a real accessible option list');
  let selectedId = null;
  const menu = ExpensePayerSelectMenu({
    id: 'test-payer',
    labelId: 'test-payer-label',
    ariaLabel: '지출자',
    options: [{ id: 'self', name: '나' }, { id: 'jisu', name: '지수' }],
    selectedId: 'self',
    activeIndex: 1,
    onSelect: id => { selectedId = id; },
    onActiveIndexChange() {},
    optionRefs: { current: [] }
  });
  const markup = renderToStaticMarkup(menu);
  const optionElements = React.Children.toArray(menu.props.children);

  assert.match(markup, /role="listbox"/);
  assert.match(markup, /role="option" aria-selected="true"/);
  assert.equal(optionElements[1].props.role, 'option');
  optionElements[1].props.onClick();
  assert.equal(selectedId, 'jisu');
});
