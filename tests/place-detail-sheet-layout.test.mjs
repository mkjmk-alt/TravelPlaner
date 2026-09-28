import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import postcss from 'postcss';

const projectRoot = new URL('..', import.meta.url);
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const stylesheet = postcss.parse(fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'));

const findRootRule = selector => {
  let match;
  stylesheet.walkRules(rule => {
    if (rule.parent.type === 'root' && rule.selector === selector) match = rule;
  });
  return match;
};

const findMobileRule = selector => {
  let match;
  stylesheet.walkAtRules('media', mediaRule => {
    if (!mediaRule.params.includes('max-width: 768px')) return;
    mediaRule.walkRules(rule => {
      if (rule.selector === selector) match = rule;
    });
  });
  return match;
};

const value = (rule, property) => rule?.nodes.find(node => node.prop === property)?.value;

test('keeps the editable place sheet content-sized and the add action below arrival time', () => {
  assert.ok(
    /className=\{`mobile-place-add-panel\$\{canAddSelectedPlaceToItinerary \? ' is-editable' : ' is-guidance'\}`\}/.test(appSource),
    'the active-trip sheet has a dedicated editable layout state'
  );

  const editablePanelRule = findRootRule('.mobile-place-add-panel.is-editable');
  const editableContentRule = findRootRule('.mobile-place-add-panel.is-editable .mobile-place-add-content');
  const mobileEditablePanelRule = findMobileRule('.mobile-place-add-panel.is-editable');

  assert.equal(value(editablePanelRule, 'height'), 'auto');
  assert.equal(value(editablePanelRule, 'min-height'), '0');
  assert.equal(value(editableContentRule, 'flex'), '0 1 auto');
  assert.equal(value(mobileEditablePanelRule, 'bottom'), 'auto');
  assert.match(value(mobileEditablePanelRule, 'max-height') || '', /100dvh/);

  const panelMarkup = appSource.slice(appSource.indexOf('{selectedPlace && ('), appSource.indexOf('{!sidebarOpen && ('));
  assert.ok(panelMarkup.indexOf('label="도착 시간"') < panelMarkup.indexOf('className="mobile-place-add-button"'));
});
