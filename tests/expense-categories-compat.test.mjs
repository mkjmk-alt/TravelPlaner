import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPENSE_CATEGORIES, normalizeExpenseCategory, categoryBudget, categoryTotals } from '../src/expenseCategories.js';

test('supports shared travel categories including four new choices', () => {
  const ids = EXPENSE_CATEGORIES.map(item => item.value);
  for (const id of ['food', 'cafe', 'transport', 'flight', 'lodging', 'sightseeing', 'activity', 'shopping', 'essentials', 'medical', 'communication', 'insurance', 'other']) assert.ok(ids.includes(id));
  assert.equal(new Set(ids).size, ids.length);
});

test('legacy iPhone lodging is grouped with web lodging without changing source', () => {
  const rows = [{ category: 'stay', amount: 100 }, { category: 'lodging', amount: 200 }, { category: 'mystery', amount: 4 }];
  assert.equal(normalizeExpenseCategory('stay'), 'lodging');
  assert.deepEqual(categoryTotals(rows, item => item.amount), { lodging: 300, other: 4 });
  assert.equal(rows[0].category, 'stay');
});

test('legacy budgets remain visible and canonical zero overrides old value', () => {
  assert.equal(categoryBudget(null, 'lodging'), 0);
  assert.equal(categoryBudget({ stay: 150 }, 'lodging'), 150);
  assert.equal(categoryBudget({ stay: 150, lodging: 0 }, 'lodging'), 0);
  assert.equal(categoryBudget({ stay: 150, lodging: 200 }, 'lodging'), 200);
});
