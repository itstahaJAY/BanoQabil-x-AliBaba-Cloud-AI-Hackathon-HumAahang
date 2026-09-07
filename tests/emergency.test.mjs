import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProfileStorage, defaultProfile, emptyEmergencyNumbers, emergencyCallTarget, validateEmergencyNumbers } from '../src/profile-data.ts';
import { createEmergencyCall } from '../src/emergency-call.ts';
import { getEmergencyCopy } from '../src/emergency-copy.ts';

const target = { kind: 'family', name: 'QA Contact', number: '+12025550147', area: '' };
test('Urdu has translated Emergency labels, help, confirmations and errors without default phone numbers', () => {
  const en = getEmergencyCopy('English'), ur = getEmergencyCopy('اردو');
  assert.equal(getEmergencyCopy('Urdu'), ur);
  assert.equal(getEmergencyCopy('Roman Urdu').title, 'Hangami madad');
  assert.notEqual(getEmergencyCopy('Roman Urdu').callNotice, en.callNotice);
  for (const [key, text] of Object.entries(en)) {
    if (typeof text === 'string') {
      assert.notEqual(ur[key], text, key);
      assert.match(ur[key], /[\u0600-\u06ff]/u, key);
    }
  }
  for (const persona of Object.keys(en.hints)) assert.notEqual(ur.hints[persona], en.hints[persona]);
  assert.deepEqual(defaultProfile.emergency, { area: '', medicalPhone: '', policePhone: '' });
});

test('malformed saved Emergency settings are never replaced by defaults or subsequent edits', async () => {
  for (const emergency of [null, { area: 17 }, { area: 'QA', medicalPhone: 'tel:1234' }, { policePhone: '1234' }]) {
    const raw = JSON.stringify({ ...defaultProfile, emergency }); let writes = 0;
    const repo = createProfileStorage({ getItem: async () => raw, setItem: async () => { writes++; } });
    await assert.rejects(repo.load());
    await assert.rejects(repo.update({ emergency: emptyEmergencyNumbers }));
    assert.equal(writes, 0);
  }
});

test('failed Emergency saves preserve saved settings and allow a later explicit retry', async () => {
  let raw = JSON.stringify(defaultProfile), fail = true;
  const before = raw;
  const repo = createProfileStorage({ getItem: async () => raw, setItem: async (_key, value) => { if (fail) throw new Error('Full disk'); raw = value; } });
  const emergency = { area: 'QA', medicalPhone: '1234', policePhone: '' };
  await assert.rejects(repo.update({ emergency }));
  assert.equal(raw, before);
  fail = false; await repo.update({ emergency });
  assert.deepEqual((await repo.load()).emergency, emergency);
});

test('legacy settings start without guessed emergency services; service edits persist without changing Passport', async () => {
  let raw = JSON.stringify({ ...defaultProfile, emergency: undefined, passport: { ...defaultProfile.passport, name: 'Keep me' } });
  const repo = createProfileStorage({ getItem: async () => raw, setItem: async (_key, value) => { raw = value; } });
  assert.deepEqual((await repo.load()).emergency, emptyEmergencyNumbers);
  await repo.update({ emergency: { area: ' QA area ', medicalPhone: ' 1234 ', policePhone: '5678' } });
  assert.equal((await repo.load()).emergency.area, 'QA area');
  assert.equal((await repo.load()).emergency.medicalPhone, '1234');
  assert.equal((await repo.load()).passport.name, 'Keep me');
  await repo.update({ emergency: emptyEmergencyNumbers });
  assert.deepEqual((await repo.load()).emergency, emptyEmergencyNumbers);
});

test('configured services require an area and safe phone syntax; empty configuration is allowed', async () => {
  assert.ok(validateEmergencyNumbers({ ...emptyEmergencyNumbers, medicalPhone: '1234' }).area);
  for (const value of ['tel:1234', '*123#', '12;ext=3', '12,345', '+12+345', 'https://x.test', '1', '1'.repeat(16)]) {
    assert.ok(validateEmergencyNumbers({ area: 'QA', medicalPhone: value, policePhone: '' }).medicalPhone, value);
  }
  assert.deepEqual(validateEmergencyNumbers(emptyEmergencyNumbers), {});
  let writes = 0;
  const repo = createProfileStorage({ getItem: async () => null, setItem: async () => { writes++; } });
  await assert.rejects(repo.update({ emergency: { area: 'QA', medicalPhone: '*123#', policePhone: '' } }));
  assert.equal(writes, 0);
});

test('targets use current saved contact independently of public-card visibility; missing targets are unavailable', () => {
  const profile = { ...defaultProfile, passport: { ...defaultProfile.passport, contactName: 'QA Contact', contactPhone: '+1 (202) 555-0147', showContact: false } };
  assert.deepEqual(emergencyCallTarget('family', profile), target);
  assert.equal(emergencyCallTarget('medical', profile), null);
  assert.equal(emergencyCallTarget('family', defaultProfile), null);
  assert.equal(emergencyCallTarget('police', { ...profile, emergency: { area: 'QA', medicalPhone: '', policePhone: '12 34' } }).number, '1234');
});

test('review and cancellation never call; confirmation opens exactly the reviewed snapshot once', async () => {
  const states = [], opened = [];
  let finish;
  const controller = createEmergencyCall(url => { opened.push(url); return new Promise(resolve => { finish = resolve; }); }, state => states.push(state));
  await controller.confirm();
  controller.review(target);
  assert.equal(states.at(-1).phase, 'review');
  assert.deepEqual(opened, []);
  controller.cancel();
  await controller.confirm();
  assert.deepEqual(opened, []);
  const mutable = { ...target };
  controller.review(mutable);
  mutable.number = '999';
  const pending = controller.confirm();
  await controller.confirm();
  assert.deepEqual(opened, ['tel:+12025550147']);
  finish(); await pending;
  assert.equal(states.at(-1).phase, 'requested', 'a handoff is not a connected call');
  controller.dispose();
});

test('phone failure preserves a readable target and requires new review before retry', async () => {
  const states = []; let opens = 0;
  const controller = createEmergencyCall(async () => { opens++; throw new Error('No phone handler'); }, state => states.push(state));
  controller.review(target); await controller.confirm();
  assert.equal(states.at(-1).issue, 'failed');
  assert.equal(states.at(-1).target.number, target.number);
  await controller.confirm(); assert.equal(opens, 1);
  controller.review(target); await controller.confirm(); assert.equal(opens, 2);
  controller.dispose();
});

test('unsafe targets and confirmation after disposal cannot invoke a phone app', async () => {
  let opens = 0; const states = [];
  const controller = createEmergencyCall(async () => { opens++; }, state => states.push(state));
  controller.review({ ...target, number: '*123#' }); await controller.confirm();
  assert.equal(states.at(-1).issue, 'invalid');
  controller.review(target); controller.dispose(); await controller.confirm();
  assert.equal(opens, 0);
});

test('leaving during handoff ignores late results; a missing result times out without automatic retry', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let finish; let opens = 0; const states = [];
  const controller = createEmergencyCall(() => { opens++; return new Promise(resolve => { finish = resolve; }); }, state => states.push(state));
  controller.review(target); const pending = controller.confirm();
  controller.cancel(); finish(); await pending;
  assert.equal(states.at(-1).phase, 'idle');
  controller.review(target); const second = controller.confirm();
  context.mock.timers.tick(10001);
  assert.equal(states.at(-1).issue, 'timeout');
  assert.equal(opens, 2);
  finish(); await second;
  assert.equal(states.at(-1).issue, 'timeout');
  controller.dispose();
});
