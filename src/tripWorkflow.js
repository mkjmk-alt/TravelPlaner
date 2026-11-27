function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

export function getTripStatus(trip, today) {
  const start = validDate(trip?.startDate);
  const end = validDate(trip?.endDate) || start;
  if (!start) return 'unknown';
  if (today < start) return 'upcoming';
  return today > end ? 'past' : 'ongoing';
}

export function groupTripsByStatus(trips, today) {
  const groups = [
    { key: 'ongoing', label: '여행 중', trips: [] },
    { key: 'upcoming', label: '다가오는 여행', trips: [] },
    { key: 'past', label: '지난 여행', trips: [] },
    { key: 'unknown', label: '날짜 미정', trips: [] }
  ];
  const groupsByKey = new Map(groups.map(group => [group.key, group.trips]));
  for (const trip of trips) groupsByKey.get(getTripStatus(trip, today)).push(trip);

  for (const group of groups) {
    if (group.key === 'unknown') continue;
    const direction = group.key === 'upcoming' ? 1 : -1;
    group.trips.sort((first, second) => direction * first.startDate.localeCompare(second.startDate));
  }
  return groups.filter(group => group.trips.length);
}
