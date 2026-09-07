import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translate, uiText, localeDirection, languageChoices } from '../src/locale.ts';
import { translationRows } from '../src/translations.ts';
import { createProfileStorage, defaultProfile, passportShareText } from '../src/profile-data.ts';
import { getEmergencyCopy } from '../src/emergency-copy.ts';
import { getContactQrCopy } from '../src/contact-qr-copy.ts';

test('exactly three interface languages, Urdu RTL and Roman Urdu LTR', () => {
  assert.deepEqual(languageChoices, ['English', 'اردو', 'Roman Urdu']);
  assert.equal(localeDirection('اردو'), 'rtl');
  assert.equal(localeDirection('Urdu'), 'rtl');
  assert.equal(localeDirection('Roman Urdu'), 'ltr');
  assert.equal(localeDirection('English'), 'ltr');
});
test('UI copy switches immediately, supports uppercase labels and preserves unknown input', () => {
  assert.equal(translate('English', 'Settings'), 'Settings');
  assert.equal(translate('اردو', 'SETTINGS'), 'ترتیبات');
  assert.equal(translate('Roman Urdu', 'Settings'), 'Tarteebat');
  assert.equal(translate('اردو', 'unknown custom input'), 'unknown custom input');
});
test('user data is verbatim even if it matches a translation key', () => {
  for (const language of languageChoices) {
    for (const value of ['Home', 'Save', '+923001234567', 'Ayesha', 'مجھے مدد چاہیے']) {
      assert.equal(uiText(language, value, true), value);
    }
  }
  assert.equal(translate('اردو', 'Hello, {name}!', { name: 'Home' }), 'السلام علیکم، Home!');
});
test('catalog has complete triples; Roman Urdu never leaks Arabic script', () => {
  for (const row of translationRows) {
    assert.equal(row.length, 3, row[0]);
    assert.ok(row.every(value => value.trim()), row[0]);
    assert.doesNotMatch(row[2], /[\u0600-\u06ff]/u, row[0]);
  }
});

test('every saved language survives reopening and changes only the language', async () => {
  let raw = JSON.stringify({ ...defaultProfile, passport: { ...defaultProfile.passport, name: 'Home', instructions: 'Save', contactPhone: '+923001234567' } });
  const disk = { getItem: async () => raw, setItem: async (_key, value) => { raw = value; } };
  const before = JSON.parse(raw);
  for (const language of languageChoices) {
    await createProfileStorage(disk).update({ language });
    const saved = await createProfileStorage(disk).load();
    assert.equal(saved.language, language);
    assert.deepEqual(saved.passport, before.passport);
    assert.deepEqual(saved.prefs, before.prefs);
  }
});
test('failed language write keeps the saved language and can be explicitly retried', async () => {
  let raw = JSON.stringify(defaultProfile), fail = true;
  const repo = createProfileStorage({ getItem: async () => raw, setItem: async (_key, value) => { if (fail) throw new Error('Full disk'); raw = value; } });
  await assert.rejects(repo.update({ language: 'اردو' }));
  assert.equal((await repo.load()).language, 'English');
  fail = false;
  await repo.update({ language: 'اردو' });
  assert.equal((await repo.load()).language, 'اردو');
});
test('passport share localizes headings and default instructions but never authored details', () => {
  const custom = { ...defaultProfile, language: 'اردو', passport: { ...defaultProfile.passport, name: 'Home', instructions: 'Save', contactName: 'Settings', contactPhone: '+923001234567', showContact: true } };
  const text = passportShareText(custom, 'Deaf / Hard of Hearing');
  assert.match(text, /ہم آہنگ/);
  assert.match(text, /\n\nHome\n\n/);
  assert.match(text, /\n\nSave\n\n/);
  assert.match(text, /Settings · \+923001234567/);
  const defaults = passportShareText({ ...custom, passport: defaultProfile.passport }, 'Deaf / Hard of Hearing');
  assert.doesNotMatch(defaults, /I am deaf|Preferred language/);
});
test('Emergency and QR have full Urdu/Roman catalogs including privacy and failures', () => {
  const strings = object => Object.values(object).flatMap(value => typeof value === 'string' ? [value] : strings(value));
  for (const copy of [getEmergencyCopy, getContactQrCopy]) {
    assert.equal(strings(copy('English')).length, strings(copy('اردو')).length);
    assert.equal(strings(copy('English')).length, strings(copy('Roman Urdu')).length);
    for (const value of strings(copy('اردو'))) assert.match(value, /[\u0600-\u06ff]/u);
    for (const value of strings(copy('Roman Urdu'))) assert.doesNotMatch(value, /[\u0600-\u06ff]/u);
  }
});
