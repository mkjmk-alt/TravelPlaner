import { getRoutePoint } from './itineraryRoutes.js';
import { getItineraryItemCategory } from './itineraryCategories.js';

const radians = degrees => degrees * Math.PI / 180;
const distanceMeters = (from, to) => {
  const latDifference = radians(to.lat - from.lat);
  const lngDifference = radians(to.lng - from.lng);
  const haversine = Math.sin(latDifference / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDifference / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
};
const pathLength = points => points.slice(1).reduce((total, point, index) => total + distanceMeters(points[index], point), 0);

const keepTimeSlot = (item, slot) => {
  if (item.time === slot.time && Object.hasOwn(item, 'time') === Object.hasOwn(slot, 'time')) return item;
  const next = { ...item };
  if (Object.hasOwn(slot, 'time')) next.time = slot.time;
  else delete next.time;
  return next;
};
const hasValidTime = item => /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || '');

// Keep the start and unknown-location slots. Meals divide the day into blocks;
// places can change within each block, but its time slots remain unchanged.
export const createNearbyOrderPreview = day => {
  const originalItems = [...(day?.items || [])];
  const stops = originalItems.map((item, index) => ({ item, index, point: getRoutePoint(item) }));
  const located = stops.filter(stop => stop.point);
  const preview = {
    day: day?.day,
    daySnapshot: JSON.stringify(day),
    originalItems,
    items: [...originalItems],
    originalIndices: stops.map(stop => stop.index),
    mealCount: originalItems.filter(item => getItineraryItemCategory(item) === 'meal').length,
    timeSlotsRestored: false,
    missingCount: originalItems.length - located.length,
    changed: false,
    reason: '',
    beforeMeters: pathLength(located.map(stop => stop.point)),
    afterMeters: 0
  };
  preview.afterMeters = preview.beforeMeters;
  if (located.length < 3) return { ...preview, reason: 'too-few' };
  if (located[0].index !== 0) return { ...preview, reason: 'start-missing' };

  // Repair the old behavior's scrambled times before using them as slots.
  // The first stop, unknown locations and unspecified times keep their slots.
  const slots = [...stops];
  const timed = stops.filter(stop => stop.index > 0 && stop.point && hasValidTime(stop.item));
  const chronological = [...timed].sort((a, b) => a.item.time.localeCompare(b.item.time));
  timed.forEach((stop, index) => { slots[stop.index] = chronological[index]; });
  preview.timeSlotsRestored = slots.some((stop, index) => stop.index !== index);

  const ordered = [...slots];
  const boundaries = slots.flatMap((stop, index) => index > 0 && getItineraryItemCategory(stop.item) === 'meal' ? [index] : []);
  boundaries.push(slots.length);
  let blockStart = 1;
  let current = slots[0].point;
  for (const boundary of boundaries) {
    const slotIndices = [];
    const remaining = [];
    for (let index = blockStart; index < boundary; index += 1) {
      if (slots[index].point) {
        slotIndices.push(index);
        remaining.push(slots[index]);
      }
    }
    for (const slotIndex of slotIndices) {
      let nearestIndex = 0;
      let nearestDistance = distanceMeters(current, remaining[0].point);
      for (let index = 1; index < remaining.length; index += 1) {
        const distance = distanceMeters(current, remaining[index].point);
        if (distance < nearestDistance - 0.001) {
          nearestIndex = index;
          nearestDistance = distance;
        }
      }
      const nearest = remaining.splice(nearestIndex, 1)[0];
      ordered[slotIndex] = nearest;
      current = nearest.point;
    }
    if (slots[boundary]?.point) current = slots[boundary].point;
    blockStart = boundary + 1;
  }
  preview.items = ordered.map((stop, index) => keepTimeSlot(stop.item, slots[index].item));
  preview.originalIndices = ordered.map(stop => stop.index);
  preview.changed = preview.items.some((item, index) => item !== originalItems[index]);
  preview.reason = preview.changed ? '' : 'already-nearby';
  preview.afterMeters = pathLength(ordered.filter(stop => stop.point).map(stop => stop.point));
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
  const original = items[index];
  const neighbor = items[target];
  items[index] = keepTimeSlot(neighbor, original);
  items[target] = keepTimeSlot(original, neighbor);
  return { ...day, items: sortDayItems(day, items) };
};
