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

const categories = new Map(EXPENSE_CATEGORIES.map(option => [option.value, option]));
export const expenseCategory = code => categories.get(code === 'stay' ? 'lodging' : code) ?? categories.get('other');

function decimal(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function getExpenseQuote(currency, rates = {}, settings = {}) {
  const code = String(currency || 'KRW').trim().toUpperCase();
  if (code === 'KRW') return 1;
  const manual = decimal(settings?.exchangeRates?.[code]?.krwPerUnit ?? settings?.manualRates?.[code]);
  if (manual > 0) return manual;
  const live = decimal(rates?.[code]);
  return live > 0 && Number.isFinite(1 / live) ? 1 / live : null;
}

export function getExpenseKRW(expense, rates, settings, { useBudgetRate = false } = {}) {
  const currency = String(expense?.currency || 'KRW').trim().toUpperCase();
  const amount = decimal(expense?.amount);
  if (amount === null) return null;
  if (currency === 'KRW') return Math.round(amount);
  const fixedRate = useBudgetRate ? decimal(settings?.budgetExchangeRates?.rates?.[currency]) : null;
  if (fixedRate > 0 && Number.isFinite(amount * fixedRate)) return Math.round(amount * fixedRate);
  const recorded = decimal(expense?.amountKRW);
  if (recorded !== null) return Math.round(recorded);
  const rate = decimal(expense?.exchangeRate) || getExpenseQuote(currency, rates, settings);
  return rate > 0 && Number.isFinite(amount * rate) ? Math.round(amount * rate) : null;
}

export function getBudgetLimit(settings) {
  if (settings?.budgetLimitMode !== 'categories') return Math.round(decimal(settings?.limitKRW) ?? 0);
  const limits = { ...settings.categoryBudgets };
  if (limits.lodging == null) limits.lodging = limits.stay;
  delete limits.stay;
  return Object.values(limits).reduce((total, value) => total + Math.round(decimal(value) ?? 0), 0);
}

export function getExpenseDay(expense) {
  const day = decimal(expense?.day);
  return Number.isInteger(day) ? day : 1;
}

export function getPreparationLabel(value) {
  const label = typeof value === 'string' ? value.trim() : '';
  return label.length <= 32 && !/[\r\n]/.test(label) && !['여행 전 준비', '기타 준비 지출'].includes(label) ? label : '';
}
