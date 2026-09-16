import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  createCashWallet,
  getCashWalletCreationCurrency,
  removeCashWalletState
} from '../src/cashWallets.js';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');

test('creates a new cash wallet using the currently selected settlement currency', () => {
  assert.match(appSource, /selectedCurrency:\s*cashLedgerCurrency/);
});

test('exposes a delete action for each cash wallet', () => {
  assert.match(appSource, /cash-wallet-delete/);
  assert.match(appSource, /removeCashWallet/);
});

test('uses the selected settlement currency for a new wallet', () => {
  assert.equal(getCashWalletCreationCurrency({
    selectedCurrency: 'JPY',
    currencyChoices: ['JPY', 'USD'],
    fallbackCurrency: 'KRW'
  }), 'JPY');
  assert.equal(getCashWalletCreationCurrency({
    selectedCurrency: 'USD',
    currencyChoices: ['JPY', 'USD'],
    fallbackCurrency: 'JPY'
  }), 'USD');
});

test('creates an empty wallet with a currency-specific default name', () => {
  assert.deepEqual(createCashWallet({ id: 'wallet-jpy', currency: 'JPY' }), {
    id: 'wallet-jpy',
    name: 'JPY 현금 지갑',
    currency: 'JPY',
    initial: 0,
    additional: 0,
    actualRemaining: ''
  });
});

test('removes a wallet and keeps the active wallet when another wallet is deleted', () => {
  const wallets = [
    { id: 'usd', currency: 'USD' },
    { id: 'jpy', currency: 'JPY' }
  ];

  assert.deepEqual(removeCashWalletState({
    wallets,
    walletId: 'usd',
    activeWalletId: 'jpy',
    selectedCurrency: 'JPY'
  }), {
    wallets: [{ id: 'jpy', currency: 'JPY' }],
    activeWalletId: 'jpy',
    cashLedgerCurrency: 'JPY'
  });
});

test('selects a remaining wallet after deleting the active wallet', () => {
  assert.deepEqual(removeCashWalletState({
    wallets: [
      { id: 'jpy-1', currency: 'JPY' },
      { id: 'jpy-2', currency: 'JPY' },
      { id: 'usd', currency: 'USD' }
    ],
    walletId: 'jpy-1',
    activeWalletId: 'jpy-1',
    selectedCurrency: 'JPY'
  }), {
    wallets: [
      { id: 'jpy-2', currency: 'JPY' },
      { id: 'usd', currency: 'USD' }
    ],
    activeWalletId: 'jpy-2',
    cashLedgerCurrency: 'JPY'
  });
});
