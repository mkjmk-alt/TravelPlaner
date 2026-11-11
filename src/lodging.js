const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function validLodgingDate(value) {
  if (!datePattern.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function getLodgings(trip) {
  return Array.isArray(trip?.lodgings) ? trip.lodgings : [];
}

export function validateLodging(lodging) {
  if (!String(lodging.name || '').trim()) return '숙소 이름을 입력해주세요.';
  if (Array.from(String(lodging.name || '')).length > 200 || Array.from(String(lodging.address || '')).length > 2000 || Array.from(String(lodging.memo || '')).length > 10000) return '숙소 이름, 주소 또는 메모가 너무 깁니다.';
  if (!validLodgingDate(lodging.checkIn) || !validLodgingDate(lodging.checkOut)) return '올바른 체크인과 체크아웃 날짜를 입력해주세요.';
  if (lodging.checkOut < lodging.checkIn) return '체크아웃 날짜는 체크인 날짜보다 빠를 수 없습니다.';
  if ([lodging.checkInTime, lodging.checkOutTime].some(value => value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) return '시간을 확인해주세요.';
  return '';
}

export function tripDayDate(startDate, day) {
  if (!validLodgingDate(startDate) || !Number.isInteger(Number(day)) || Number(day) < 1) return '';
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(day) - 1);
  return date.toISOString().slice(0, 10);
}

export function lodgingForDate(lodgings, date) {
  if (!validLodgingDate(date)) return [];
  return lodgings.flatMap(lodging => {
    if (!lodging || typeof lodging !== 'object') return [];
    if (!validLodgingDate(lodging.checkIn) || !validLodgingDate(lodging.checkOut) || lodging.checkOut < lodging.checkIn) return [];
    const checkIn = date === lodging.checkIn;
    const checkOut = date === lodging.checkOut;
    const overnight = lodging.checkIn <= date && date < lodging.checkOut;
    return checkIn || checkOut || overnight ? [{ lodging, checkIn, checkOut, overnight }] : [];
  });
}

export function addLodgingEvents(trip, lodging, makeId) {
  const error = validateLodging(lodging);
  if (error) throw new Error(error);
  if (!lodging.id || !Array.isArray(trip.itinerary)) throw new Error('숙소 또는 일정을 다시 확인해주세요.');
  const events = [
    { kind: 'checkIn', date: lodging.checkIn, time: lodging.checkInTime || '', label: '체크인' },
    { kind: 'checkOut', date: lodging.checkOut, time: lodging.checkOutTime || '', label: '체크아웃' }
  ];
  const existing = new Set(trip.itinerary.flatMap(day => (day.items || []).map(item => item.lodgingEventKey).filter(Boolean)));
  for (const item of trip.reserveItems || []) if (item.lodgingEventKey) existing.add(item.lodgingEventKey);
  let added = 0;
  const itinerary = trip.itinerary.map((day, index) => {
    const date = tripDayDate(trip.startDate, day.day || index + 1);
    const additions = events.flatMap(event => {
      const key = `${lodging.id}:${event.kind}`;
      if (event.date !== date || event.date < trip.startDate || (validLodgingDate(trip.endDate) && event.date > trip.endDate) || existing.has(key)) return [];
      existing.add(key); added += 1;
      return [{ id: makeId(), name: `${lodging.name} ${event.label}`, loc: lodging.address || '', time: event.time, memo: lodging.memo || '', emoji: '🏨', category: 'lodging', lodgingEventKey: key, ...(lodging.lat != null && lodging.lng != null ? { lat: lodging.lat, lng: lodging.lng } : {}), ...(lodging.placeId ? { placeId: lodging.placeId } : {}), ...(lodging.nativePlaceSource ? { nativePlaceSource: lodging.nativePlaceSource } : {}) }];
    });
    return additions.length ? { ...day, items: [...(day.items || []), ...additions] } : day;
  });
  if (!added) throw new Error('추가할 일정이 없어요. 이미 추가되었거나 날짜가 여행 기간 밖입니다.');
  return { itinerary, added };
}
