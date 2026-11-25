import { getGooglePlaceID } from './placeBusinessDetails.js';

const mapSelectionName = '지도에서 선택한 장소';
const text = value => typeof value === 'string' ? value.trim() : '';
const storedName = (item, value) =>
  value === mapSelectionName && getGooglePlaceID(item) ? '' : value;

export function getItineraryDisplayName(item) {
  return storedName(item, text(item?.displayName));
}

export function getItineraryNameLookupID(item) {
  if (getItineraryDisplayName(item) || storedName(item, text(item?.name))) return undefined;
  return getGooglePlaceID(item);
}

export function getItineraryPlaceLabel(item, googleName) {
  return getItineraryDisplayName(item) || storedName(item, text(item?.name)) || text(googleName)
    || text(item?.name) || text(item?.displayName) || '장소 이름 정보 없음';
}

const pendingNames = new WeakMap();

export function fetchItineraryPlaceName(maps, id) {
  if (!maps || !id) return Promise.resolve('');
  let requests = pendingNames.get(maps);
  if (!requests) {
    requests = new Map();
    pendingNames.set(maps, requests);
  }
  if (!requests.has(id)) {
    const request = (async () => {
      const library = maps.places?.Place ? maps.places : await maps.importLibrary?.('places');
      if (!library?.Place) return '';
      const place = new library.Place({ id });
      await place.fetchFields({ fields: ['displayName'] });
      return text(place.displayName);
    })().catch(() => '').finally(() => requests.delete(id));
    requests.set(id, request);
  }
  return requests.get(id);
}
