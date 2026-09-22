import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('native map preview keeps transport, identity and permission boundaries explicit', () => {
  const manifest = read('android/nativepreview/src/main/AndroidManifest.xml');
  assert.ok(manifest.includes('android:usesCleartextTraffic="false"'));
  assert.ok(manifest.includes('android:allowBackup="false"'));
  assert.ok(!manifest.includes('ACCESS_BACKGROUND_LOCATION'));
  const gradle = read('android/nativepreview/build.gradle.kts');
  assert.ok(gradle.includes('applicationId = "com.travelplaner.app.nativepreview"'));
  assert.ok(gradle.includes('minSdk = 26'));
  const info = read('ios/NativePreview/Info.plist');
  assert.ok(!info.includes('NSAllowsArbitraryLoads'));
  assert.ok(!info.includes('NSLocationAlwaysAndWhenInUseUsageDescription'));
  assert.ok(info.includes('NSLocationWhenInUseUsageDescription'));
});
test('native preview local key files are ignored and examples have no real key', () => {
  for (const path of ['android/native-maps.properties', 'ios/NativePreview/Map/NativeMaps.local.xcconfig']) {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: new URL('..', import.meta.url) });
  }
  for (const path of ['android/native-maps.properties.example', 'ios/NativePreview/Map/NativeMaps.xcconfig.example']) {
    assert.ok(!/AIza[0-9A-Za-z_-]{30}/.test(read(path)));
  }
});

test('native WebView URL is build-configured and release cannot inherit a local URL', () => {
  const iosProject = read('ios/project.yml');
  const iosConfiguration = read('ios/TravelPlaner/AppConfiguration.swift');
  const iosDebug = read('ios/TravelPlaner/Build/Debug.xcconfig');
  const iosLocalExample = read('ios/TravelPlaner/Build/Debug.local.xcconfig.example');
  const iosDebugInfo = read('ios/TravelPlaner/Info-Debug.plist');
  const iosRelease = read('ios/TravelPlaner/Build/Release.xcconfig');
  const androidManifest = read('android/app/src/main/AndroidManifest.xml');
  const androidDebugManifest = read('android/app/src/debug/AndroidManifest.xml');
  const androidGradle = read('android/app/build.gradle.kts');
  const androidConfiguration = read('android/app/src/main/java/com/travelplaner/app/AppConfig.kt');

  assert.match(iosProject, /TripPlotWebURL: \$\(TRIPPLOT_WEB_URL\)/);
  assert.match(iosProject, /Debug: TravelPlaner\/Build\/Debug\.xcconfig/);
  assert.match(iosProject, /Release: TravelPlaner\/Build\/Release\.xcconfig/);
  assert.match(iosConfiguration, /TripPlotWebURL/);
  assert.match(iosConfiguration, /isInternalWebOrigin/);
  assert.match(iosDebug, /TRIPPLOT_WEB_URL\s*=\s*https:\/\$\(\)\/travelplaner-545\.pages\.dev\//);
  assert.match(iosLocalExample, /TRIPPLOT_WEB_URL\s*=\s*http:\/\$\(\)\/127\.0\.0\.1:4173\//);
  assert.match(iosRelease, /TRIPPLOT_WEB_URL\s*=\s*https:\/\$\(\)\/travelplaner-545\.pages\.dev\//);
  assert.match(iosProject, /Debug:\s*\n\s+INFOPLIST_FILE: TravelPlaner\/Info-Debug\.plist/);
  assert.match(iosDebugInfo, /<key>NSAllowsLocalNetworking<\/key>\s*\n\s*<true\/>/);
  assert.doesNotMatch(iosRelease, /NSAllowsLocalNetworking/);
  assert.match(androidManifest, /android:usesCleartextTraffic="false"/);
  assert.match(androidDebugManifest, /android:usesCleartextTraffic="true"/);
  assert.match(androidDebugManifest, /tools:replace="android:usesCleartextTraffic"/);

  assert.match(androidGradle, /buildConfigField\("String", "WEB_BASE_URL"/);
  assert.match(androidGradle, /travelplanerDebugWebUrl/);
  assert.match(androidGradle, /release\s*\{[\s\S]*WEB_BASE_URL/);
  assert.match(androidConfiguration, /BuildConfig\.WEB_BASE_URL/);
  assert.match(androidConfiguration, /BuildConfig\.WEB_ORIGIN/);
});
