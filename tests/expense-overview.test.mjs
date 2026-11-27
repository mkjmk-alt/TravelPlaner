import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseCategory, getBudgetLimit, getExpenseKRW, getExpenseQuote, getExpenseDay } from '../src/expenseOverview.js';
import * as overview from '../src/expenseOverview.js';

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

test('resolves settlement from saved web and mobile records, including a recorded zero', () => {
  const { getRecordedExpenseKRW } = overview;
  assert.equal(getRecordedExpenseKRW({ currency: 'JPY', amount: 1200, amountKRW: '10801', exchangeRate: 9, exchangeRateMode: 'manual' }), 10801);
  assert.equal(getRecordedExpenseKRW({ currency: 'JPY', amount: 1200, amountKRW: 0 }), 0);
  assert.equal(getRecordedExpenseKRW({ currency: 'KRW', amount: 3999.5, amountKRW: 3999 }), 3999);
  assert.equal(getRecordedExpenseKRW({ currency: ' usd ', amount: '1.005', amountKRW: '', exchangeRate: '100' }), 101);
  assert.equal(getRecordedExpenseKRW({ currency: 'JPY', amount: 1200 }), null);
});

test('keeps exact legacy conversion fields on edits and does not record a later quote during a memo edit', () => {
  const original = Object.freeze({ amount: '500.00', currency: ' jpy ', amountKRW: '4975', exchangeRate: '9.7', exchangeRateMode: 'manual' });
  assert.deepEqual(overview.resolveExpenseConversion({ amount: 500, currency: 'JPY', memo: '수정' }, original, { JPY: 0.2 }), {
    amountKRW: '4975', exchangeRate: '9.7', exchangeRateMode: 'manual'
  });
  assert.deepEqual(overview.resolveExpenseConversion({ amount: '500', currency: 'JPY' }, { amount: 500, currency: 'JPY', amountKRW: null }, { JPY: 0.2 }), { amountKRW: null });
  assert.deepEqual(overview.resolveExpenseConversion({ amount: 500 }, { amount: 500, amountKRW: 499 }, { JPY: 0.2 }, { travelCurrency: 'JPY' }), { amountKRW: 499 });
  assert.deepEqual(overview.resolveExpenseConversion({ amount: 501, currency: 'JPY' }, original, { JPY: 0.2 }), {
    amountKRW: 2505, exchangeRate: 5, exchangeRateMode: 'auto'
  });
  assert.deepEqual(overview.resolveExpenseConversion({ amount: 500, currency: 'JPY', conversionMode: 'auto' }, original, { JPY: 0.2 }), {
    amountKRW: 2500, exchangeRate: 5, exchangeRateMode: 'auto'
  });
});

test('distinguishes manual KRW from a manual rate and rounds the conversion once per expense', () => {
  const { resolveExpenseConversion } = overview;
  const input = { amount: '1.005', currency: 'USD' };
  assert.deepEqual(resolveExpenseConversion({ ...input, conversionMode: 'manual-krw', manualAmountKRW: '0' }), {
    amountKRW: 0, exchangeRate: null, exchangeRateMode: 'manual'
  });
  assert.deepEqual(resolveExpenseConversion({ ...input, conversionMode: 'manual-rate', manualExchangeRate: '100' }), {
    amountKRW: 101, exchangeRate: 100, exchangeRateMode: 'manual'
  });
  assert.equal(resolveExpenseConversion({ ...input, amount: '1.004999999999999', conversionMode: 'manual-rate', manualExchangeRate: 100 }).amountKRW, 100);
  assert.equal(resolveExpenseConversion({ ...input, conversionMode: 'manual-rate', manualExchangeRate: '0' }), null);
  assert.equal(resolveExpenseConversion({ ...input, conversionMode: 'manual-krw', manualAmountKRW: '12.5' }), null);
  assert.equal(resolveExpenseConversion({ ...input, conversionMode: 'manual-krw', manualAmountKRW: '' }), null);
  assert.deepEqual(resolveExpenseConversion(input), { amountKRW: null, exchangeRate: null, exchangeRateMode: 'auto' });
});

test('captures usable budget rates and keeps a partial snapshot independent of later quotes', () => {
  const rates = { JPY: 0.1, USD: 0.001 };
  const settings = { exchangeRates: { JPY: { krwPerUnit: '9.5' } } };
  const snapshot = overview.createBudgetRateSnapshot(['krw', 'JPY', 'jpy', 'USD', 'VND'], rates, settings, '2026-11-25');
  assert.deepEqual(snapshot, { date: '2026-11-25', rates: { KRW: 1, JPY: 9.5, USD: 1000 } });
  const fixed = { ...settings, budgetExchangeRates: snapshot };
  const futureRates = { JPY: 0.2, USD: 0.01, VND: 20 };
  const useSnapshot = { useBudgetRate: true };
  assert.equal(getExpenseKRW({ currency: 'JPY', amount: 15, amountKRW: 160 }, futureRates, fixed, useSnapshot), 143);
  assert.equal(getExpenseKRW({ currency: 'VND', amount: 10000, amountKRW: 510 }, futureRates, fixed, useSnapshot), 510);
  assert.equal(getExpenseKRW({ currency: 'VND', amount: 10000 }, futureRates, fixed, useSnapshot), null);
});

test('compares recorded KRW on the same basis across trips and separates prep from the daily average', () => {
  const { summarizeTripExpenses } = overview;
  const trip = {
    startDate: '2026-03-07', endDate: '2026-03-09',
    budgetSettings: { budgetExchangeRates: { rates: { JPY: 1, USD: 2 } } },
    expenses: [
      { amount: 100, currency: 'JPY', amountKRW: 905, category: 'stay', day: '0' },
      { amount: '1.005', currency: 'USD', exchangeRate: 100, category: 'food', day: 1 },
      { amount: 200, category: 'unknown', day: 3 },
      { amount: 500, currency: 'JPY', category: 'shopping', day: 2 }
    ]
  };
  assert.deepEqual(summarizeTripExpenses(trip), {
    totalKRW: 1206, averageDailyKRW: 100, dayCount: 3, recordedCount: 3, excludedCount: 1,
    byDay: { 0: 905, 1: 101, 3: 200 }, byCategory: { lodging: 905, food: 101, other: 200 }
  });
  assert.equal(summarizeTripExpenses({ itinerary: [{ day: 'Day 1' }, { day: 'Day 3' }], expenses: [{ amount: 90 }] }).averageDailyKRW, 30);
  assert.equal(summarizeTripExpenses({}).averageDailyKRW, null);
});
