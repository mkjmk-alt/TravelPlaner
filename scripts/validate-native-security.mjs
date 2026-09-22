import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [androidManifest, androidDebugManifest, androidActivity, androidConfig, iosInfo, iosWebView, iosConfig] = await Promise.all([
  read('android/app/src/main/AndroidManifest.xml'),
  read('android/app/src/debug/AndroidManifest.xml'),
  read('android/app/src/main/java/com/travelplaner/app/MainActivity.kt'),
  read('android/app/src/main/java/com/travelplaner/app/AppConfig.kt'),
  read('ios/TravelPlaner/Info.plist'),
  read('ios/TravelPlaner/TravelWebView.swift'),
  read('ios/TravelPlaner/AppConfiguration.swift'),
]);

const requireText = (source, expected, message) => {
  assert.ok(source.includes(expected), message);
};

requireText(androidManifest, 'android:usesCleartextTraffic="false"', 'Android cleartext traffic must stay disabled.');
requireText(androidDebugManifest, 'android:usesCleartextTraffic="true"', 'Android local cleartext traffic must be limited to Debug builds.');
requireText(androidDebugManifest, 'tools:replace="android:usesCleartextTraffic"', 'Android Debug cleartext override must be explicit.');
requireText(androidManifest, 'android:allowBackup="false"', 'Android application backup must stay disabled.');
for (const permission of ['CAMERA', 'RECORD_AUDIO', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO']) {
  assert.ok(!androidManifest.includes(`android.permission.${permission}`), `Unexpected Android permission: ${permission}`);
}
requireText(androidActivity, 'allowFileAccess = false', 'Android WebView file access must stay disabled.');
requireText(androidActivity, 'mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW', 'Android mixed content must stay blocked.');
requireText(androidActivity, 'safeBrowsingEnabled = true', 'Android Safe Browsing must stay enabled.');
requireText(androidActivity, 'applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0', 'Android WebView debugging must be gated by the debuggable application flag.');
requireText(androidActivity, 'AppConfig.isInternalWebUrl(uri)', 'Android navigation must use the internal URL allowlist.');
requireText(androidActivity, 'AppConfig.isInternalWebUrl(originUri)', 'Android geolocation must verify the requesting origin.');
requireText(androidActivity, 'WebViewCompat.addWebMessageListener', 'Android must use the origin-scoped WebMessage bridge.');
requireText(androidActivity, 'setOf(AppConfig.WEB_ORIGIN)', 'Android native messages must be restricted to the build-configured web origin.');
requireText(androidActivity, '!isMainFrame', 'Android native messages must reject iframe senders.');
assert.ok(!androidActivity.includes('addJavascriptInterface'), 'Legacy all-frame Android JavaScript bridges are not allowed.');
requireText(androidConfig, 'val WEB_BASE_URL: String = BuildConfig.WEB_BASE_URL', 'Android must read the build-configured web URL.');
requireText(androidConfig, 'val WEB_ORIGIN: String = BuildConfig.WEB_ORIGIN', 'Android must read the build-configured web origin.');
requireText(androidConfig, 'uri.scheme?.lowercase() == configured.scheme?.lowercase()', 'Android internal URLs must match the configured scheme.');
requireText(androidConfig, 'uri.host?.lowercase() == configured.host?.lowercase()', 'Android must pin internal navigation to the configured host.');

requireText(iosInfo, '<string>travelplaner</string>', 'iOS authentication callback scheme is missing.');
assert.ok(!iosInfo.includes('NSAllowsArbitraryLoads'), 'iOS must not opt out of App Transport Security.');
requireText(iosWebView, 'AppConfiguration.isInternalWebURL(url)', 'iOS navigation must use the internal URL allowlist.');
requireText(iosWebView, 'AppConfiguration.isInternalWebOrigin(', 'iOS native bridge must use the configured web origin.');
requireText(iosConfig, 'static let webURL: URL', 'iOS must read the build-configured web URL.');
requireText(iosConfig, 'static func isInternalWebOrigin(', 'iOS must validate the configured web origin.');

console.log('Native security configuration is valid.');
