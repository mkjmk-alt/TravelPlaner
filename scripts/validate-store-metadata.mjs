import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const appStore = await readJson('../store-metadata/app-store-ko.json');
const googlePlay = await readJson('../store-metadata/google-play-ko.json');
const privacy = await readJson('../store-metadata/privacy-declarations.json');

const assertText = (value, field, maximum) => {
  assert.equal(typeof value, 'string', `${field} must be a string`);
  assert.ok(value.trim().length > 0, `${field} must not be empty`);
  assert.ok(Array.from(value).length <= maximum, `${field} exceeds ${maximum} characters`);
};

const assertHttpsUrl = (value, field) => {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', `${field} must use HTTPS`);
};

assertText(appStore.name, 'App Store name', 30);
assertText(appStore.subtitle, 'App Store subtitle', 30);
assertText(appStore.promotionalText, 'App Store promotional text', 170);
assertText(appStore.keywords, 'App Store keywords', 100);
assertText(appStore.description, 'App Store description', 4000);
assertText(appStore.releaseNotes, 'App Store release notes', 4000);
assertText(appStore.reviewNotes, 'App Store review notes', 4000);

assertText(googlePlay.title, 'Google Play title', 30);
assertText(googlePlay.shortDescription, 'Google Play short description', 80);
assertText(googlePlay.fullDescription, 'Google Play full description', 4000);
assertText(googlePlay.releaseNotes, 'Google Play release notes', 500);

for (const [field, value] of Object.entries({
  appStoreSupportUrl: appStore.supportUrl,
  appStoreMarketingUrl: appStore.marketingUrl,
  appStorePrivacyPolicyUrl: appStore.privacyPolicyUrl,
  appStorePrivacyChoicesUrl: appStore.privacyChoicesUrl,
  appStoreTermsUrl: appStore.termsUrl,
  googlePlayPrivacyPolicyUrl: googlePlay.privacyPolicyUrl,
  googlePlayAccountDeletionUrl: googlePlay.accountDeletionUrl,
  googlePlayTermsUrl: googlePlay.termsUrl,
  privacyAccountDeletionUrl: privacy.accountDeletionUrl
})) {
  assertHttpsUrl(value, field);
}

assert.equal(privacy.tracking, false, 'Tracking declaration must remain false');
assert.equal(privacy.advertising, false, 'Advertising declaration must remain false');
assert.equal(privacy.dataSale, false, 'Data sale declaration must remain false');
assert.ok(Array.isArray(privacy.dataTypes) && privacy.dataTypes.length > 0, 'Privacy data types are required');

console.log('Store metadata is within the current Apple and Google text limits.');
