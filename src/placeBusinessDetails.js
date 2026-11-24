export const getGooglePlaceID = (place) => [place?.googlePlaceId, place?.placeId]
  .find(value => typeof value === 'string' && value.trim() && value.trim().length <= 1024)?.trim();

export function safePlaceLink(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

export function placeMapsURL(place) {
  const query = [place?.name || place?.displayName, place?.loc || place?.address].filter(Boolean).join(' ');
  const id = getGooglePlaceID(place);
  if (!query && !id) return '';
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query || '장소');
  if (id) url.searchParams.set('query_place_id', id);
  return url.href;
}

const closureLabels = new Map([
  ['CLOSED_TEMPORARILY', '임시 휴업'],
  ['CLOSED_PERMANENTLY', '폐업'],
  ['FUTURE_OPENING', '개업 예정']
]);
export const placeClosure = status => closureLabels.get(status) ?? '';

const dayMinutes = 1440;
const weekMinutes = 7 * dayMinutes;
const minuteOfWeek = point => {
  if (!point || ![point.day, point.hour, point.minute].every(Number.isInteger)
      || point.day < 0 || point.day > 6 || point.hour < 0 || point.hour > 23 || point.minute < 0 || point.minute > 59) return null;
  return point.day * dayMinutes + point.hour * 60 + point.minute;
};

function localDay(now, timeZone, utcOffsetMinutes) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now);
      return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)?.value).join('-');
    } catch {
      // Fall back to the offset included in the same Google response.
    }
  }
  return Number.isFinite(utcOffsetMinutes)
    ? new Date(now.getTime() + utcOffsetMinutes * 60000).toISOString().slice(0, 10)
    : '';
}

export function visitAvailability({ date, time, details, now = new Date() }) {
  const validTime = typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (!validTime || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const visit = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(visit.getTime()) || visit.toISOString().slice(0, 10) !== date) return null;
  const today = localDay(now, details.timeZone?.id, details.utcOffsetMinutes);
  if (!today || date < today) return null;
  const daysAhead = (visit.getTime() - Date.parse(today + 'T00:00:00Z')) / 86400000;
  const current = daysAhead < 7 && Array.isArray(details.currentOpeningHours?.periods);
  const periods = (current ? details.currentOpeningHours : details.regularOpeningHours)?.periods;
  if (!Array.isArray(periods)) return null;
  const [hour, minute] = time.split(':').map(Number);
  const visitMinute = visit.getUTCDay() * dayMinutes + hour * 60 + minute;
  let open = false;
  for (const period of periods) {
    const start = minuteOfWeek(period.open);
    const end = minuteOfWeek(period.close);
    if (start === null || (period.close && end === null)) return null;
    if (!period.close) {
      open = true; // The documented 24/7 representation has no closing point.
      continue;
    }
    const truncated = period.close.truncated;
    const close = truncated && end % dayMinutes === dayMinutes - 1 ? (end + 1) % weekMinutes : end;
    if (truncated && close === start) open = true;
    else if (close < start) open ||= visitMinute >= start || visitMinute < close;
    else open ||= visitMinute >= start && visitMinute < close;
  }
  return { open, current };
}
