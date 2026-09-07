import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captionRequest, deviceCaptionPlan, transcriptLanguageLabel } from '../src/caption-provider.ts';

test('caption intent requests Urdu/English automatically while unsupported platforms disclose fallback', () => {
  assert.deepEqual(captionRequest, { languageMode: 'auto', languageHints: ['ur-PK', 'en-US'] });
  for (const [platform, version] of [['web', 0], ['ios', '18.0'], ['android', 33]]) {
    for (const locale of ['en-US', 'ur-PK']) {
      const plan = deviceCaptionPlan(platform, version, locale);
      assert.deepEqual(plan.startConfig, { lang: locale });
      assert.equal(plan.savedLanguage, locale);
      assert.match(plan.detail, /fallback/);
      assert.match(plan.limitation, /mixed speech may be missed/);
    }
  }
});

test('Android 14+ requests actual switching, not just detection, without claiming verified support', () => {
  const plan = deviceCaptionPlan('android', 34, 'ur-PK');
  assert.equal(plan.startConfig.androidIntentOptions.EXTRA_ENABLE_LANGUAGE_SWITCH, 'balanced');
  assert.deepEqual(plan.startConfig.androidIntentOptions.EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES, ['ur-PK', 'en-US']);
  assert.match(plan.detail, /requested/);
  assert.match(plan.limitation, /not guaranteed/);
  assert.equal(plan.savedLanguage, 'und');
});

test('history preserves old locale labels and never labels unknown or auto transcripts as English', () => {
  assert.equal(transcriptLanguageLabel('en-US'), 'English');
  assert.equal(transcriptLanguageLabel('ur-PK'), 'Urdu');
  assert.equal(transcriptLanguageLabel('und'), 'Language not verified');
  assert.equal(transcriptLanguageLabel('auto'), 'Language not verified');
});
