import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after, before } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
let viteServer;
let AccountMoreActions;
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
    ({ default: AccountMoreActions } = await viteServer.ssrLoadModule('/src/AccountMoreActions.jsx'));
  } catch (error) {
    componentLoadError = error;
  }
});

after(async () => {
  await viteServer?.close();
});

test('shows account deletion only for signed-in users and preserves account actions', () => {
  assert.ok(AccountMoreActions, `AccountMoreActions must load: ${componentLoadError?.message || 'missing export'}`);
  const calls = [];
  const signedInProps = {
    session: { user: { id: 'user-1' } },
    onSignOut: () => calls.push('sign-out'),
    onLogin: () => calls.push('login'),
    onDeleteAccount: () => calls.push('delete-account')
  };
  const signedInElement = AccountMoreActions(signedInProps);
  const signedInMarkup = renderToStaticMarkup(React.createElement(AccountMoreActions, signedInProps));
  const signedInButtons = React.Children.toArray(signedInElement.props.children);

  assert.match(signedInMarkup, /로그아웃/);
  assert.match(signedInMarkup, /계정 삭제/);
  assert.match(signedInMarkup, /mobile-more-item--danger/);
  signedInButtons.forEach(button => button.props.onClick());
  assert.deepEqual(calls, ['sign-out', 'delete-account']);

  const signedOutProps = { ...signedInProps, session: null };
  const signedOutElement = AccountMoreActions(signedOutProps);
  const signedOutMarkup = renderToStaticMarkup(React.createElement(AccountMoreActions, signedOutProps));
  const signedOutButtons = React.Children.toArray(signedOutElement.props.children);

  assert.match(signedOutMarkup, /로그인 \/ 회원가입/);
  assert.doesNotMatch(signedOutMarkup, /계정 삭제/);
  assert.equal(signedOutButtons.length, 1);
  signedOutButtons[0].props.onClick();
  assert.equal(calls.at(-1), 'login');
});

test('mounts account deletion in More and not beside the TripPlot header', () => {
  const headerStart = appSource.indexOf('className={"sidebar-header');
  const authActionsStart = appSource.indexOf('className="sidebar-auth-actions"', headerStart);
  const moreStart = appSource.indexOf('{/* --- MORE MODE --- */}');
  const moreEnd = appSource.indexOf('<div className="sidebar-list-end-meta"', moreStart);
  const headerAuthRegion = appSource.slice(authActionsStart, appSource.indexOf('className="sidebar-top-actions"', authActionsStart));
  const moreRegion = appSource.slice(moreStart, moreEnd);

  assert.ok(headerStart >= 0 && authActionsStart > headerStart, 'header account actions exist');
  assert.ok(moreStart >= 0 && moreEnd > moreStart, 'More menu region exists');
  assert.doesNotMatch(headerAuthRegion, /requestAccountDeletion|AccountMoreActions/);
  assert.match(moreRegion, /<AccountMoreActions\b/);
});
