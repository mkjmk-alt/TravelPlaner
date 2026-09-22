import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const iosContentView = read('ios/TravelPlaner/ContentView.swift');
const androidMainActivity = read('android/app/src/main/java/com/travelplaner/app/MainActivity.kt');
const androidStrings = read('android/app/src/main/res/values/strings.xml');

test('iOS shows recovery UI for any main-frame load failure, not only offline paths', () => {
  assert.match(iosContentView, /if browser\.lastError != nil \{/);
  assert.doesNotMatch(iosContentView, /if browser\.lastError != nil && browser\.isOffline/);
  assert.match(iosContentView, /저장된 일정은 삭제되지 않습니다/);
});

test('Android shows recovery UI for any main-frame WebView error', () => {
  assert.match(androidMainActivity, /if \(request\.isForMainFrame\) \{[\s\S]*offlineView\.visibility = View\.VISIBLE/);
  assert.doesNotMatch(androidMainActivity, /offlineView\.visibility = if \(isOnline\(\)\) View\.GONE else View\.VISIBLE/);
  assert.match(androidStrings, /기기에 저장된 일정은 삭제되지 않습니다/);
});
