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

const normalizeCoordinate = (value) => {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
};

const normalizeJournalPlace = (place) => {
  if (!place || typeof place !== 'object') return null;

  const day = Number(place.day);
  const normalizedDay = Number.isFinite(day) && day > 0 ? day : null;
  const id = String(place.id || '').trim();
  const name = String(place.name || '').trim();
  if (!id && !name) return null;

  return {
    key: String(place.key || `${normalizedDay || 'unknown'}:${id || name}`),
    day: normalizedDay,
    id,
    name,
    address: String(place.address || '').trim(),
    lat: normalizeCoordinate(place.lat),
    lng: normalizeCoordinate(place.lng),
    emoji: String(place.emoji || '📍')
  };
};

export const getItineraryPlaceOptions = (trip = {}) => {
  const itinerary = Array.isArray(trip?.itinerary) ? trip.itinerary : [];

  return itinerary.flatMap((dayPlan, dayIndex) => {
    const day = Number(dayPlan?.day) || dayIndex + 1;
    const items = Array.isArray(dayPlan?.items) ? dayPlan.items : [];

    return items.map((item, itemIndex) => {
      if (!item || typeof item !== 'object') return null;
      const id = String(item.id || `day-${day}-place-${itemIndex + 1}`).trim();
      const name = String(item.displayName || item.name || '').trim();
      if (!name) return null;

      return {
        key: `${day}:${id}`,
        day,
        id,
        name,
        address: String(item.loc || item.address || '').trim(),
        lat: normalizeCoordinate(item.lat),
        lng: normalizeCoordinate(item.lng),
        emoji: String(item.emoji || '📍')
      };
    }).filter(Boolean);
  });
};

export const getJournalEntries = (trip = {}) => (
  Array.isArray(trip?.journalEntries)
    ? trip.journalEntries.filter(entry => entry && typeof entry === 'object').map(entry => {
      const place = normalizeJournalPlace(entry.place);
      return {
        id: String(entry.id || ''),
        date: String(entry.date || ''),
        title: String(entry.title || ''),
        body: String(entry.body || ''),
        imageDataUrl: String(entry.imageDataUrl || ''),
        ...(place ? { place } : {}),
        createdAt: Number(entry.createdAt) || 0,
        updatedAt: Number(entry.updatedAt) || Number(entry.createdAt) || 0
      };
    })
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

export const getTripDayOptions = (trip = {}) => {
  const itinerary = Array.isArray(trip?.itinerary) ? trip.itinerary : [];
  if (itinerary.length > 0) {
    return [...new Set(itinerary.map((dayPlan, index) => {
      const day = Number(dayPlan?.day) || index + 1;
      return Number.isInteger(day) && day > 0 ? day : null;
    }).filter(Boolean))].sort((left, right) => left - right);
  }

  const startDate = parseDateOnly(trip.startDate);
  const endDate = parseDateOnly(trip.endDate || trip.startDate);
  if (!startDate || !endDate || endDate < startDate) return [];

  const duration = getCalendarDayDifference(startDate, endDate) + 1;
  return Array.from({ length: duration }, (_, index) => index + 1);
};

export const getJournalEntryDay = (entry = {}, trip = {}) => {
  const linkedDay = Number(entry?.place?.day);
  if (Number.isInteger(linkedDay) && linkedDay > 0) return linkedDay;

  const startDate = parseDateOnly(trip.startDate);
  const endDate = parseDateOnly(trip.endDate || trip.startDate);
  const entryDate = parseDateOnly(entry?.date);
  if (!startDate || !entryDate || entryDate < startDate || (endDate && entryDate > endDate)) return null;

  return getCalendarDayDifference(startDate, entryDate) + 1;
};

export const sortJournalEntriesForTimeline = (entries = []) => (
  [...entries].sort((left, right) => {
    const leftDate = parseDateOnly(left?.date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightDate = parseDateOnly(right?.date)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (leftDate !== rightDate) return leftDate - rightDate;

    const leftCreatedAt = Number(left?.createdAt) || 0;
    const rightCreatedAt = Number(right?.createdAt) || 0;
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  })
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
  place,
  now = Date.now()
} = {}) => {
  const normalizedPlace = normalizeJournalPlace(place);
  return {
    id: id || globalThis.crypto?.randomUUID?.() || `journal-${now}-${Math.random().toString(36).slice(2, 8)}`,
    date: String(date || '').trim(),
    title: String(title || '').trim(),
    body: String(body || '').trim(),
    imageDataUrl: String(imageDataUrl || ''),
    ...(normalizedPlace ? { place: normalizedPlace } : {}),
    createdAt: Number(now) || Date.now(),
    updatedAt: Number(now) || Date.now()
  };
};
