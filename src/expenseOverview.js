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
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number || 0 : null;
}

const currencyCode = currency => String(currency ?? '').trim().toUpperCase() || 'KRW';
const positiveRate = value => decimal(value) || null;

function roundKRW(value) {
  const amount = decimal(value);
  if (amount === null) return null;
  const rounded = Math.round(amount);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

function decimalParts(number) {
  const [coefficient, exponent = '0'] = String(number).split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  return { digits: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
}

function convertToKRW(amount, rate) {
  if (amount === null || rate === null) return null;
  if (rate === 1 || (Number.isSafeInteger(amount) && Number.isSafeInteger(rate))) return roundKRW(amount * rate);
  // Multiply decimal digits before rounding to avoid binary float errors at a half won.
  const original = decimalParts(amount);
  const quote = decimalParts(rate);
  const exponent = original.exponent + quote.exponent;
  const product = original.digits * quote.digits;
  const scale = 10n ** BigInt(Math.abs(exponent));
  const rounded = Number(exponent < 0 ? (product + scale / 2n) / scale : product * scale);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

export function getExpenseQuote(currency, rates = {}, settings = {}) {
  const code = currencyCode(currency);
  if (code === 'KRW') return 1;
  const manual = positiveRate(settings?.exchangeRates?.[code]?.krwPerUnit) ?? positiveRate(settings?.manualRates?.[code]);
  if (manual !== null) return manual;
  const live = positiveRate(rates?.[code]);
  return live === null ? null : positiveRate(1 / live);
}

export function getRecordedExpenseKRW(expense) {
  const saved = roundKRW(expense?.amountKRW);
  if (saved !== null) return saved;
  const rate = currencyCode(expense?.currency) === 'KRW' ? 1 : positiveRate(expense?.exchangeRate);
  return convertToKRW(decimal(expense?.amount), rate);
}

export function getBudgetExpenseRate(currency, settings) {
  const code = currencyCode(currency);
  return code === 'KRW' ? 1 : positiveRate(settings?.budgetExchangeRates?.rates?.[code]);
}

export function createBudgetRateSnapshot(currencies = [], rates, settings, date) {
  const codes = new Set(['KRW', ...currencies.map(currencyCode)]);
  const entries = [...codes].map(code => [code, getExpenseQuote(code, rates, settings)]);
  return { date, rates: Object.fromEntries(entries.filter(([, rate]) => rate !== null)) };
}

export function getExpenseKRW(expense, rates, settings, { useBudgetRate = false } = {}) {
  const currency = currencyCode(expense?.currency);
  const amount = decimal(expense?.amount);
  const recorded = getRecordedExpenseKRW(expense);
  if (useBudgetRate && settings?.budgetExchangeRates) {
    const fixed = currency === 'KRW' ? null : convertToKRW(amount, getBudgetExpenseRate(currency, settings));
    return fixed ?? recorded;
  }
  return recorded ?? convertToKRW(amount, getExpenseQuote(currency, rates, settings));
}

// A missing conversion mode preserves the existing fields when the normalized amount and currency match.
// An invalid manual input returns null. A valid amount with no available quote keeps amountKRW null.
export function resolveExpenseConversion(input, original, rates, settings) {
  const amount = decimal(input?.amount);
  if (amount === null || amount <= 0) return null;
  const defaultCurrency = original ? original.currency : settings?.travelCurrency;
  const currency = currencyCode(input.currency || defaultCurrency);
  const mode = input.conversionMode ?? 'recorded';
  if (mode === 'recorded' && original && amount === decimal(original.amount) && currency === currencyCode(original.currency)) {
    return Object.fromEntries(['amountKRW', 'exchangeRate', 'exchangeRateMode']
      .filter(field => Object.hasOwn(original, field)).map(field => [field, original[field]]));
  }
  if (mode === 'manual-krw') {
    const amountKRW = decimal(input.manualAmountKRW);
    if (!Number.isSafeInteger(amountKRW)) return null;
    return { amountKRW, exchangeRate: null, exchangeRateMode: 'manual' };
  }
  const manualRate = mode === 'manual-rate';
  const exchangeRate = manualRate ? positiveRate(input.manualExchangeRate) : getExpenseQuote(currency, rates, settings);
  const amountKRW = convertToKRW(amount, exchangeRate);
  if ((manualRate || exchangeRate !== null) && amountKRW === null) return null;
  return { amountKRW, exchangeRate, exchangeRateMode: manualRate ? 'manual' : 'auto' };
}

export function getBudgetLimit(settings) {
  if (settings?.budgetLimitMode !== 'categories') return Math.round(decimal(settings?.limitKRW) ?? 0);
  const limits = { ...settings.categoryBudgets };
  if (limits.lodging == null) limits.lodging = limits.stay;
  delete limits.stay;
  return Object.values(limits).reduce((total, value) => total + Math.round(decimal(value) ?? 0), 0);
}

function expenseDayNumber(value) {
  const legacy = typeof value === 'string' && value.trim().match(/^(?:day\s*(\d+)|(\d+)\s*일차)$/i);
  const day = decimal(legacy ? legacy[1] ?? legacy[2] : value);
  return Number.isSafeInteger(day) ? day : null;
}

export function getExpenseDay(expense) {
  return expenseDayNumber(expense?.day) ?? 1;
}

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / 86400000 : null;
}

export function summarizeTripExpenses(trip) {
  const start = calendarDay(trip?.startDate);
  const end = calendarDay(trip?.endDate || trip?.startDate);
  let dayCount = start !== null && end !== null && end >= start ? end - start + 1 : 0;
  if (Array.isArray(trip?.itinerary)) {
    trip.itinerary.forEach((plan, index) => {
      dayCount = Math.max(dayCount, expenseDayNumber(plan?.day) ?? index + 1);
    });
  }

  const byDay = {};
  const byCategory = {};
  let totalKRW = 0;
  let recordedCount = 0;
  let excludedCount = 0;
  const expenses = Array.isArray(trip?.expenses) ? trip.expenses : [];
  for (const expense of expenses) {
    const day = getExpenseDay(expense);
    dayCount = Math.max(dayCount, day);
    const amountKRW = getRecordedExpenseKRW(expense);
    if (amountKRW === null) {
      excludedCount += 1;
      continue;
    }
    const category = expenseCategory(expense?.category).value;
    byDay[day] = (byDay[day] ?? 0) + amountKRW;
    byCategory[category] = (byCategory[category] ?? 0) + amountKRW;
    totalKRW += amountKRW;
    recordedCount += 1;
  }
  const averageDailyKRW = dayCount > 0 ? Math.round((totalKRW - (byDay[0] ?? 0)) / dayCount) : null;
  return { totalKRW, averageDailyKRW, dayCount, recordedCount, excludedCount, byDay, byCategory };
}

export function getPreparationLabel(value) {
  const label = typeof value === 'string' ? value.trim() : '';
  return label.length <= 32 && !/[\r\n]/.test(label) && !['여행 전 준비', '기타 준비 지출'].includes(label) ? label : '';
}
