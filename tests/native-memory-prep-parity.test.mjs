import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { getTravelDetails, getJournalEntries, sortJournalEntriesForTimeline } from '../src/travelMemory.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../contracts/native/fixtures/memory-prep.json', import.meta.url), 'utf8'));

test('native fixture agrees with the existing web view of travel memory', () => {
  assert.deepEqual(getTravelDetails(fixture), {
    departure: '인천',
    arrival: '간사이',
    flightNumber: 'KE001',
    stayName: '난바 호텔',
    stayAddress: '오사카'
  });
  assert.deepEqual(
    sortJournalEntriesForTimeline(getJournalEntries(fixture)).map(entry => entry.id),
    ['earlier', 'same-a', 'same-z', 'undated']
  );
  assert.deepEqual(fixture.checklist.map(entry => Boolean(entry.checked)), [true, false, false, false]);
});

for (const name of ['memory-ios-export.json', 'memory-android-export.json']) {
  test(`${name} keeps a portable photo that the web helper can render`, () => {
    const portable = JSON.parse(fs.readFileSync(new URL(`../contracts/native/fixtures/${name}`, import.meta.url), 'utf8'));
    const sourceEntry = portable.journalEntries[0];
    const entries = getJournalEntries(portable);
    const dataUrl = sourceEntry.imageDataUrl;
    const [header, encoded] = dataUrl.split(',', 2);
    const bytes = Buffer.from(encoded, 'base64');

    assert.equal(header, 'data:image/png;base64');
    assert.equal(bytes.length, 68);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460');
    assert.equal(entries[0].imageDataUrl, dataUrl);
    assert.equal(Object.hasOwn(sourceEntry, 'imageFileName'), false);
  });
}
