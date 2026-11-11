export const EXPENSE_CATEGORIES = [
  { value: 'food', label: '식비', emoji: '🍽️' },
  { value: 'cafe', label: '카페·간식', emoji: '☕' },
  { value: 'transport', label: '교통', emoji: '🚕' },
  { value: 'lodging', label: '숙박', emoji: '🛏️' },
  { value: 'flight', label: '항공', emoji: '✈️' },
  { value: 'sightseeing', label: '관광', emoji: '🎟️' },
  { value: 'activity', label: '액티비티·체험', emoji: '🎢' },
  { value: 'shopping', label: '쇼핑', emoji: '🛍️' },
  { value: 'essentials', label: '생활·편의', emoji: '🧴' },
  { value: 'medical', label: '의료·약국', emoji: '💊' },
  { value: 'communication', label: '통신', emoji: '📶' },
  { value: 'insurance', label: '보험', emoji: '🛡️' },
  { value: 'other', label: '기타', emoji: '🧾' }
];

export const normalizeExpenseCategory = value => value === 'stay' ? 'lodging' : (value || 'other');
export const categoryBudget = (budgets = {}, category) => {
  const stored = budgets ?? {};
  const value = Object.hasOwn(stored, category) ? stored[category] : (category === 'lodging' ? stored.stay : 0);
  return Number(value) || 0;
};
export const categoryTotals = (expenses, amountFor) => expenses.reduce((totals, expense) => {
  const normalized = normalizeExpenseCategory(expense.category);
  const category = EXPENSE_CATEGORIES.some(item => item.value === normalized) ? normalized : 'other';
  totals[category] = (totals[category] || 0) + amountFor(expense);
  return totals;
}, {});
