import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProfileStorage, defaultProfile, emptyPassport, validatePassportSettings, normalizePassportSettings, passportPresentation, passportShareText } from '../src/profile-data.ts';

const settings = (passport = {}) => ({ persona: 'deaf', language: 'English', passport: { ...emptyPassport, ...passport } });
function memoryDisk(initial) {
  let raw = initial ?? null;
  return { getItem: async () => raw, setItem: async (_key, value) => { raw = value; }, raw: () => raw };
}

test('legacy profile loads without seeding a fictional identity or replacing preferences', async () => {
  const disk = memoryDisk(JSON.stringify({ onboarded: true, language: 'اردو', persona: 'mute', prefs: { haptics: false } }));
  const value = await createProfileStorage(disk).load();
  assert.equal(value.persona, 'mute');
  assert.equal(value.language, 'اردو');
  assert.equal(value.onboarded, true);
  assert.equal(value.prefs.haptics, false);
  assert.equal(value.prefs.voiceGuidance, true);
  assert.equal(value.prefs.gestures, true, 'existing profiles receive the bounded-pad gesture default without a write');
  assert.deepEqual(value.passport, emptyPassport);
  assert.equal(JSON.parse(disk.raw()).passport, undefined, 'reading must not write a migration');
});

test('gesture disable survives reopening without replacing other preferences or passport data', async () => {
  const disk = memoryDisk(JSON.stringify({ ...defaultProfile, prefs: { ...defaultProfile.prefs, highContrast: true }, passport: { ...emptyPassport, name: 'QA' } }));
  const repository = createProfileStorage(disk), value = await repository.load();
  await repository.update({ prefs: { ...value.prefs, gestures: false } });
  const reopened = await createProfileStorage(disk).load();
  assert.equal(reopened.prefs.gestures, false);
  assert.equal(reopened.prefs.highContrast, true);
  assert.equal(reopened.passport.name, 'QA');
});

test('passport, profile and language save atomically and survive reopening without losing accessibility preferences', async () => {
  const disk = memoryDisk(JSON.stringify({ ...defaultProfile, onboarded: true, prefs: { ...defaultProfile.prefs, highContrast: true } }));
  const edited = { ...settings({ name: '  QA Person  ', instructions: '  Please write.  ', contactName: ' QA Contact ', contactPhone: '+92 300 1234567' }), persona: 'blind', language: 'اردو' };
  await createProfileStorage(disk).update(edited);
  const loaded = await createProfileStorage(disk).load();
  assert.equal(loaded.passport.name, 'QA Person');
  assert.equal(loaded.passport.instructions, 'Please write.');
  assert.equal(loaded.passport.contactName, 'QA Contact');
  assert.equal(loaded.persona, 'blind');
  assert.equal(loaded.language, 'اردو');
  assert.equal(loaded.onboarded, true);
  assert.equal(loaded.prefs.highContrast, true);
});

test('invalid contacts and excessive text cannot save; blank optional details can be cleared', async () => {
  assert.ok(validatePassportSettings(settings({ contactPhone: 'call me' })).contactPhone);
  assert.ok(validatePassportSettings(settings({ contactPhone: '+92+3011234567' })).contactPhone);
  assert.ok(validatePassportSettings(settings({ contactName: 'Contact' })).contactPhone);
  assert.ok(validatePassportSettings(settings({ showContact: true })).contactPhone);
  assert.ok(validatePassportSettings(settings({ name: 'x'.repeat(81) })).name);
  assert.ok(validatePassportSettings(settings({ instructions: 'x'.repeat(601) })).instructions);
  assert.deepEqual(validatePassportSettings(settings()), {});
  const disk = memoryDisk();
  await assert.rejects(createProfileStorage(disk).update(settings({ contactPhone: 'abc' })), /phone/i);
  assert.equal(disk.raw(), null);
});

test('hidden identity and contact are omitted from both card presentation and share payload', () => {
  const value = settings({ name: 'Private name', showName: false, contactName: 'Private contact', contactPhone: '+92 300 1234567', showContact: false });
  const card = passportPresentation(value, 'Deaf / Hard of Hearing');
  assert.equal(card.name, '');
  assert.equal(card.contact, '');
  assert.match(card.instructions, /written messages/);
  const shared = passportShareText(value, 'Deaf / Hard of Hearing');
  assert.doesNotMatch(shared, /Private|1234567|showContact/);
  assert.match(shared, /Preferred language: English/);
});

test('custom instructions, Urdu and opted-in contact use the same display/share values', () => {
  const value = { ...settings({ name: 'عائشہ', instructions: 'براہ کرم لکھیں۔', contactName: 'QA Contact', contactPhone: '+92 300 1234567', showContact: true }), language: 'اردو' };
  const text = passportShareText(value, 'Deaf / Hard of Hearing');
  assert.match(text, /عائشہ/);
  assert.match(text, /براہ کرم لکھیں۔/);
  assert.match(text, /QA Contact · \+92 300 1234567/);
  assert.equal(normalizePassportSettings(settings({ instructions: '  ' })).passport.instructions, '');
});

test('clearing saved optional fields does not restore demo identity or contact', async () => {
  const disk = memoryDisk();
  const repo = createProfileStorage(disk);
  await repo.update(settings({ name: 'QA', contactPhone: '+92 300 1234567', showContact: true }));
  await repo.update(settings());
  assert.deepEqual((await repo.load()).passport, emptyPassport);
});

test('malformed or future saved data is not silently overwritten', async () => {
  for (const raw of ['{oops', '[]', '{"persona":"unknown"}', '{"passport":{"name":4}}', '{"schemaVersion":99}']) {
    const disk = memoryDisk(raw);
    await assert.rejects(createProfileStorage(disk).load());
    await assert.rejects(createProfileStorage(disk).update(settings({ name: 'New' })));
    assert.equal(disk.raw(), raw);
  }
});

test('queued updates preserve adjacent changes and recover after a failed write', async () => {
  let fail = true;
  const disk = memoryDisk();
  const repo = createProfileStorage({ getItem: disk.getItem, setItem: async (...args) => {
    if (fail) { fail = false; throw new Error('Storage full'); }
    return disk.setItem(...args);
  } });
  await assert.rejects(repo.update(settings({ name: 'Not saved' })), /Storage full/);
  assert.equal((await repo.load()).passport.name, '');
  await Promise.all([repo.update(settings({ name: 'Saved' })), repo.update({ onboarded: true }), repo.update({ prefs: { ...defaultProfile.prefs, haptics: false } })]);
  const value = await repo.load();
  assert.equal(value.passport.name, 'Saved');
  assert.equal(value.onboarded, true);
  assert.equal(value.prefs.haptics, false);
});
