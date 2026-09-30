import { getRoutePoint } from './itineraryRoutes.js';

const radians = degrees => degrees * Math.PI / 180;
const distanceMeters = (from, to) => {
  const latDifference = radians(to.lat - from.lat);
  const lngDifference = radians(to.lng - from.lng);
  const haversine = Math.sin(latDifference / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDifference / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
};
const pathLength = points => points.slice(1).reduce((total, point, index) => total + distanceMeters(points[index], point), 0);

// The first stop is the anchor. Unknown locations keep their slots, so notes
// and reservations are never silently moved to a different part of the day.
export const createNearbyOrderPreview = day => {
  const originalItems = [...(day?.items || [])];
  const located = originalItems.flatMap((item, index) => {
    const point = getRoutePoint(item);
    return point ? [{ item, index, point }] : [];
  });
  const preview = {
    day: day?.day,
    daySnapshot: JSON.stringify(day),
    originalItems,
    items: [...originalItems],
    missingCount: originalItems.length - located.length,
    changed: false,
    reason: '',
    beforeMeters: pathLength(located.map(stop => stop.point)),
    afterMeters: 0
  };
  preview.afterMeters = preview.beforeMeters;
  if (located.length < 3) return { ...preview, reason: 'too-few' };
  if (located[0].index !== 0) return { ...preview, reason: 'start-missing' };

  const ordered = [located[0]];
  const remaining = located.slice(1);
  while (remaining.length) {
    const current = ordered.at(-1).point;
    let nearestIndex = 0;
    let nearestDistance = distanceMeters(current, remaining[0].point);
    for (let index = 1; index < remaining.length; index += 1) {
      const distance = distanceMeters(current, remaining[index].point);
      if (distance < nearestDistance - 0.001) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }
    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }
  located.forEach((stop, index) => { preview.items[stop.index] = ordered[index].item; });
  preview.changed = preview.items.some((item, index) => item !== originalItems[index]);
  preview.reason = preview.changed ? '' : 'already-nearby';
  preview.afterMeters = pathLength(ordered.map(stop => stop.point));
  return preview;
};

// A cloud update or an edit while the preview is open must not be overwritten.
export const applyNearbyOrderPreview = (itinerary, preview) => {
  const index = itinerary.findIndex(day => String(day.day) === String(preview.day));
  if (index === -1 || !preview.changed || JSON.stringify(itinerary[index]) !== preview.daySnapshot) return null;
  return itinerary.map((day, dayIndex) => dayIndex === index
    ? { ...day, orderMode: 'distance', items: [...preview.items] }
    : day);
};

// Existing days keep their time-based behavior. A distance-sorted day's order
// stays explicit when editing times or appending/moving places into the day.
export const sortDayItems = (day, items, { missingTime = '00:00' } = {}) => day.orderMode === 'distance'
  ? [...items]
  : [...items].sort((left, right) => (left.time || missingTime).localeCompare(right.time || missingTime));

export const moveDayItem = (day, itemId, direction) => {
  const items = [...(day.items || [])];
  const index = items.findIndex(item => item.id === itemId);
  const target = index + (direction === 'up' ? -1 : 1);
  if (index === -1 || target < 0 || target >= items.length) return day;
  if (day.orderMode === 'distance') {
    [items[index], items[target]] = [items[target], items[index]];
    return { ...day, items };
  }
  const original = items[index];
  const neighbor = items[target];
  items[index] = { ...neighbor, time: original.time };
  items[target] = { ...original, time: neighbor.time };
  return { ...day, items: sortDayItems(day, items) };
};
