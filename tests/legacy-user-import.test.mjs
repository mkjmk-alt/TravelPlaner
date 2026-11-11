import assert from 'node:assert/strict';
import test from 'node:test';

import { convertLegacyUserStateRows, hashLegacySnapshot } from '../src/sync/legacyUserStateImporter.js';

test('legacy v1 travel and saved-place rows become stable sync records without private data', () => {
  const rows = [
    {
      key: 'world_pro_trips_v1',
      value: [
        { id: 'trip-1', name: 'Tokyo', updatedAt: 10, sharedManagementToken: 'secret' },
        { id: 'local-test', name: 'Fixture', localOnly: true }
      ]
    },
    {
      key: 'world_pro_fav_v1',
      value: [{ name: 'Senso-ji', loc: 'Tokyo, Japan' }, { id: 'place-2', name: 'Cafe', loc: 'Osaka' }]
    }
  ];

  const first = convertLegacyUserStateRows('user-1', rows);
  const second = convertLegacyUserStateRows('user-1', rows);

  assert.deepEqual(first.records.map(item => [item.type, item.recordID]), [
    ['trip', 'trip-1'],
    ['savedPlace', first.records[1].recordID],
    ['savedPlace', 'place-2']
  ]);
  assert.equal(first.records[0].payload.sharedManagementToken, undefined);
  assert.equal(first.records.some(item => item.recordID === 'local-test'), false);
  assert.equal(first.records[1].recordID, second.records[1].recordID);
});

test('invalid legacy entries are isolated while valid rows survive and duplicate IDs are reported', () => {
  const result = convertLegacyUserStateRows('user-1', [
    { key: 'world_pro_trips_v1', value: [null, { name: 'Missing id' }, { id: 'same', name: 'Valid' }, { id: 'same', name: 'Duplicate' }] },
    { key: 'world_pro_fav_v1', value: [{ name: 'Missing location' }, { name: 'Valid place', loc: 'Rome' }] },
    { key: 'unknown_key', value: [] }
  ]);

  assert.equal(result.records.length, 2);
  assert.equal(result.invalidEntries.length, 3);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].recordID, 'same');
});

test('legacy snapshot fingerprints are stable for key order and change when old-client data changes', async () => {
  const first = await hashLegacySnapshot([{ key: 'world_pro_trips_v1', value: [{ id: 'trip-1', name: 'Tokyo' }] }]);
  const same = await hashLegacySnapshot([{ value: [{ name: 'Tokyo', id: 'trip-1' }], key: 'world_pro_trips_v1' }]);
  const changed = await hashLegacySnapshot([{ key: 'world_pro_trips_v1', value: [{ id: 'trip-1', name: 'Osaka' }] }]);

  assert.equal(first, same);
  assert.notEqual(first, changed);
});
