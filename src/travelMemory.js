const TRAVEL_DETAIL_KEYS = [
  'departure',
  'arrival',
  'flightNumber',
  'stayName',
  'stayAddress'
];

export const getDefaultTravelDetails = () => ({
  departure: '',
  arrival: '',
  flightNumber: '',
  stayName: '',
  stayAddress: ''
});

export const getTravelDetails = (trip = {}) => {
  const source = trip?.travelDetails && typeof trip.travelDetails === 'object'
    ? trip.travelDetails
    : {};

  return TRAVEL_DETAIL_KEYS.reduce((details, key) => {
    details[key] = String(source[key] || '');
    return details;
  }, getDefaultTravelDetails());
};

export const getJournalEntries = (trip = {}) => (
  Array.isArray(trip?.journalEntries)
    ? trip.journalEntries.filter(entry => entry && typeof entry === 'object').map(entry => ({
      id: String(entry.id || ''),
      date: String(entry.date || ''),
      title: String(entry.title || ''),
      body: String(entry.body || ''),
      imageDataUrl: String(entry.imageDataUrl || ''),
      createdAt: Number(entry.createdAt) || 0,
      updatedAt: Number(entry.updatedAt) || Number(entry.createdAt) || 0
    }))
    : []
);

const parseDateOnly = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
};

const getCalendarDayDifference = (fromDate, toDate) => (
  Math.round((toDate.getTime() - fromDate.getTime()) / 86400000)
);

export const getTripDurationLabel = (trip = {}) => {
  const startDate = parseDateOnly(trip.startDate);
  const endDate = parseDateOnly(trip.endDate || trip.startDate);
  if (!startDate || !endDate || endDate < startDate) return '일정 미정';
  return `${getCalendarDayDifference(startDate, endDate) + 1}일`;
};

export const getTripCountdownLabel = (trip = {}, today = new Date()) => {
  const startDate = parseDateOnly(trip.startDate);
  const endDate = parseDateOnly(trip.endDate || trip.startDate);
  const todayDate = parseDateOnly(today);
  if (!startDate || !endDate || !todayDate || endDate < startDate) return '일정 미정';

  const untilStart = getCalendarDayDifference(todayDate, startDate);
  if (untilStart > 0) return `${untilStart}일 후 출발`;
  if (todayDate <= endDate) return '여행 중';
  return '여행 종료';
};

export const createJournalEntry = ({
  id,
  date = '',
  title = '',
  body = '',
  imageDataUrl = '',
  now = Date.now()
} = {}) => ({
  id: id || globalThis.crypto?.randomUUID?.() || `journal-${now}-${Math.random().toString(36).slice(2, 8)}`,
  date: String(date || '').trim(),
  title: String(title || '').trim(),
  body: String(body || '').trim(),
  imageDataUrl: String(imageDataUrl || ''),
  createdAt: Number(now) || Date.now(),
  updatedAt: Number(now) || Date.now()
});
