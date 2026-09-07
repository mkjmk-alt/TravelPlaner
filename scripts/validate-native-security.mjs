import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [androidManifest, androidActivity, androidConfig, iosInfo, iosWebView, iosConfig] = await Promise.all([
  read('android/app/src/main/AndroidManifest.xml'),
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
requireText(androidActivity, 'setOf(AppConfig.PRODUCTION_ORIGIN)', 'Android native messages must be restricted to the production origin.');
requireText(androidActivity, '!isMainFrame', 'Android native messages must reject iframe senders.');
assert.ok(!androidActivity.includes('addJavascriptInterface'), 'Legacy all-frame Android JavaScript bridges are not allowed.');
requireText(androidConfig, 'uri.scheme?.lowercase() == "https"', 'Android internal URLs must require HTTPS.');
requireText(androidConfig, 'uri.host?.lowercase() == Uri.parse(PRODUCTION_URL).host?.lowercase()', 'Android must pin internal navigation to the production host.');

requireText(iosInfo, '<string>travelplaner</string>', 'iOS authentication callback scheme is missing.');
assert.ok(!iosInfo.includes('NSAllowsArbitraryLoads'), 'iOS must not opt out of App Transport Security.');
requireText(iosWebView, 'AppConfiguration.isInternalWebURL(url)', 'iOS navigation must use the internal URL allowlist.');
requireText(iosWebView, 'origin.protocol.lowercased() == "https"', 'iOS native bridge must require an HTTPS origin.');
requireText(iosConfig, 'url.scheme?.lowercased() == "https"', 'iOS internal URLs must require HTTPS.');
requireText(iosConfig, 'url.host?.lowercased() == productionURL.host?.lowercased()', 'iOS must pin internal navigation to the production host.');

console.log('Native security configuration is valid.');
