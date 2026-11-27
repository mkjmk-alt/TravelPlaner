import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseCategory, getBudgetLimit, getExpenseKRW, getExpenseQuote, getExpenseDay } from '../src/expenseOverview.js';

test('keeps a saved amount during an exchange outage and leaves unknown conversion unanswered', () => {
  assert.equal(getExpenseKRW({ currency: 'JPY', amount: 500, amountKRW: 5000 }), 5000);
  assert.equal(getExpenseKRW({ currency: 'JPY', amount: 500 }), null);
  assert.equal(getExpenseKRW({ currency: 'JPY', amount: 500, amountKRW: null, exchangeRate: 9 }), 4500);
  assert.equal(getExpenseKRW({ amount: '4000' }), 4000);
});

test('uses the saved expense value and respects a trip budget exchange snapshot for budget comparisons', () => {
  const expense = { currency: 'JPY', amount: 500, amountKRW: 5000 };
  const settings = { exchangeRates: { JPY: { krwPerUnit: 11 } }, budgetExchangeRates: { date: '2026-11-25', rates: { JPY: 9 } } };
  assert.equal(getExpenseQuote('JPY', { JPY: 0.1 }, settings), 11);
  assert.equal(getExpenseKRW(expense, { JPY: 0.1 }, settings), 5000);
  assert.equal(getExpenseKRW(expense, { JPY: 0.1 }, settings, { useBudgetRate: true }), 4500);
  assert.equal(getExpenseKRW({ currency: 'JPY', amount: 500 }, { JPY: 0.1 }), 5000);
});

test('recognizes mobile categories and legacy lodging without hiding unknown records', () => {
  assert.equal(expenseCategory('cafe').label, '카페·간식');
  assert.equal(expenseCategory('stay').value, 'lodging');
  assert.equal(expenseCategory('legacy-custom').value, 'other');
  assert.equal(getBudgetLimit({ budgetLimitMode: 'categories', limitKRW: 0, categoryBudgets: { stay: 500, lodging: 1000, cafe: 200, food: -10 } }), 1200);
  assert.equal(getBudgetLimit({ limitKRW: '' }), 0);
  assert.equal(getExpenseDay({ day: '0' }), 0);
  assert.equal(getExpenseDay({}), 1);
});
