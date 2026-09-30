export const ITINERARY_ICON_OPTIONS = [
  { emoji: '📍', category: 'other', label: '기타' },
  { emoji: '✈️', category: 'flight', label: '항공' },
  { emoji: '🏨', category: 'lodging', label: '숙박' },
  { emoji: '🍽️', category: 'meal', label: '식사' },
  { emoji: '☕', category: 'cafe', label: '카페' },
  { emoji: '🏖️', category: 'sightseeing', label: '관광' },
  { emoji: '🛍️', category: 'shopping', label: '쇼핑' },
  { emoji: '🚗', category: 'transport', label: '교통' },
  { emoji: '🎫', category: 'activity', label: '액티비티' },
  { emoji: '📸', category: 'sightseeing', label: '관광' },
  { emoji: '🌅', category: 'sightseeing', label: '관광' },
  { emoji: '🏛️', category: 'sightseeing', label: '관광' },
  { emoji: '🎉', category: 'event', label: '행사' },
  { emoji: '🧳', category: 'other', label: '기타' }
];

const normalizeEmoji = emoji => String(emoji || '').replace(/\uFE0F/g, '');
const iconOption = emoji => ITINERARY_ICON_OPTIONS.find(option => normalizeEmoji(option.emoji) === normalizeEmoji(emoji));

export const withItineraryIcon = (item, emoji) => ({
  ...item,
  emoji: emoji || item.emoji || '📍',
  category: iconOption(emoji || item.emoji)?.category || 'other'
});

// Older saved schedules have only an icon, or use an expense-style food category.
export const getItineraryItemCategory = item => {
  const category = String(item?.category || '').trim().toLowerCase();
  if (['meal', 'food', '식사', '식비'].includes(category)) return 'meal';
  if (ITINERARY_ICON_OPTIONS.some(option => option.category === category)) return category;
  return iconOption(item?.emoji)?.category || 'other';
};
