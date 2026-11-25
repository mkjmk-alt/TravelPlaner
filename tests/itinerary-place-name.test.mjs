import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchItineraryPlaceName,
  getItineraryDisplayName,
  getItineraryNameLookupID,
  getItineraryPlaceLabel
} from '../src/itineraryPlaceName.js';

const reference = {
  nativePlaceSource: 'google',
  placeId: 'park-id',
  name: '지도에서 선택한 장소',
  displayName: ''
};

test('prefers a saved itinerary name and skips the Google lookup when a real name exists', () => {
  const custom = { ...reference, displayName: '  첫날 공원 산책  ' };
  assert.equal(getItineraryPlaceLabel(custom, '공원'), '첫날 공원 산책');
  assert.equal(getItineraryNameLookupID(custom), undefined);
  assert.equal(getItineraryNameLookupID({ ...reference, name: '저장한 공원' }), undefined);
  assert.equal(getItineraryPlaceLabel({ name: '지도에서 선택한 장소' }), '지도에서 선택한 장소');
});

test('uses the resolved Google name for native placeholders without making it an editable override', () => {
  const oldEdit = { ...reference, displayName: '지도에서 선택한 장소' };
  assert.equal(getItineraryNameLookupID(oldEdit), 'park-id');
  assert.equal(getItineraryDisplayName(oldEdit), '');
  assert.equal(getItineraryPlaceLabel(oldEdit, '공원'), '공원');
  assert.equal(getItineraryPlaceLabel(oldEdit), '지도에서 선택한 장소');
  assert.equal(getItineraryNameLookupID({ ...reference, nativePlaceSource: undefined, googlePlaceId: 'web-id' }), 'web-id');
  assert.equal(getItineraryNameLookupID({ ...reference, placeId: undefined }), undefined);
});

test('requests only the Google display name and coalesces concurrent requests for the same place', async () => {
  const requests = [];
  const maps = {
    places: {
      Place: class {
        constructor({ id }) { this.id = id; }
        async fetchFields({ fields }) {
          requests.push({ id: this.id, fields });
          this.displayName = '  공원  ';
        }
      }
    }
  };
  assert.deepEqual(await Promise.all([
    fetchItineraryPlaceName(maps, 'park-id'),
    fetchItineraryPlaceName(maps, 'park-id')
  ]), ['공원', '공원']);
  assert.deepEqual(requests, [{ id: 'park-id', fields: ['displayName'] }]);
});
