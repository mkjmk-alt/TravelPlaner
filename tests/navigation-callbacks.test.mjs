import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.jsx'), 'utf8');
const memoryPanelSource = fs.readFileSync(path.join(projectRoot, 'src/TravelMemoryPanel.jsx'), 'utf8');

test('does not pass a click event into the itinerary navigation callback', () => {
  assert.doesNotMatch(appSource, /onClick=\{openItinerary\}/);
});

test('does not pass a click event into the travel memory navigation callback', () => {
  assert.doesNotMatch(appSource, /onClick=\{openTravelMemory\}/);
});

test('keeps the travel memory panel action independent from the click event', () => {
  assert.doesNotMatch(memoryPanelSource, /onClick=\{onOpenItinerary\}/);
});
