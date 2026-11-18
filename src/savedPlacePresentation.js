import { getRoutePoint } from './itineraryRoutes.js';

const nonblank = value => typeof value === 'string' ? value.trim() : '';

export function getSavedPlaceEntries(favorites) {
  if (!Array.isArray(favorites)) return [];
  return favorites.flatMap(place => {
    if (!place || typeof place !== 'object' || Array.isArray(place)) return [];
    const address = [place.loc, place.address, place.location, place.formatted_address].map(nonblank).find(Boolean) || '';
    const name = [place.displayName, place.name].map(nonblank).find(Boolean) || address;
    const position = getRoutePoint(place);
    if (!name && !position && !place.id && !place.placeId && !place.place_id) return [];
    return [{ place, name: name || '이름 없는 장소', address, position }];
  });
}
