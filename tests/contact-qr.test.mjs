import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { contactQrValue, createContactQr } from '../src/contact-qr.ts';
import { getContactQrCopy } from '../src/contact-qr-copy.ts';
import { defaultProfile, emergencyCallTarget, passportShareText } from '../src/profile-data.ts';

// Independent decoder, also supplied by expo-camera; local WASM, no CDN or phone calls.
prepareZXingModule({ overrides: { wasmBinary: readFileSync(new URL(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm'))) } });

test('only explicit consent exposes the normalized contact international number without a URI prefix', () => {
  assert.equal(contactQrValue('+12025550147', false), null);
  assert.equal(createContactQr('+12025550147', false), null);
  assert.equal(contactQrValue('+12025550147', true), '+12025550147');
});

test('QR uses the existing private contact, not service numbers, without changing Passport visibility', () => {
  const profile = { ...defaultProfile, passport: { ...defaultProfile.passport, contactName: 'QA Contact', contactPhone: '+1 (202) 555-0147', showContact: false }, emergency: { area: 'QA', medicalPhone: '1234', policePhone: '5678' } };
  const before = JSON.stringify(profile);
  const target = emergencyCallTarget('family', profile);
  assert.equal(createContactQr(target.number, true).value, '+12025550147');
  assert.equal(JSON.stringify(profile), before);
  assert.ok(!passportShareText(profile, 'Deaf').includes('QA Contact'));
  assert.equal(createContactQr(target.number, false), null);
});

test('Urdu QR copy includes translated privacy, controls, scanner instructions and recovery messages', () => {
  const english = getContactQrCopy('English'), urdu = getContactQrCopy('اردو');
  for (const key of Object.keys(english)) {
    assert.notEqual(urdu[key], english[key], key);
    assert.match(urdu[key], /[\u0600-\u06ff]/u, key);
  }
  assert.equal(getContactQrCopy('Urdu'), urdu);
});

test('QR payload refuses missing, local-only, malformed and executable dial strings', () => {
  for (const number of ['', '03001234567', 'tel:+12025550147', '+0123456789', '+12', '+1'.repeat(8), '+1 2025550147', '+12025550147;ext=2', '*123#', '+1234567890123456']) {
    assert.equal(contactQrValue(number, true), null, number);
    assert.equal(createContactQr(number, true), null, number);
  }
});

test('rendered black bars decode to exactly the contact number, with a four-module quiet zone', async () => {
  const qr = createContactQr('+12025550147', true);
  assert.ok(qr);
  const scale = 6, width = qr.size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const bar of qr.bars) {
    assert.ok(bar.x >= 4 && bar.y >= 4 && bar.x + bar.width <= qr.size - 4 && bar.y < qr.size - 4);
    for (let y = bar.y * scale; y < (bar.y + 1) * scale; y++) {
      for (let x = bar.x * scale; x < (bar.x + bar.width) * scale; x++) {
        const p = (y * width + x) * 4; pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
      }
    }
  }
  const decoded = await readBarcodes({ data: pixels, width, height: width }, { formats: ['QRCode'] });
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].text, '+12025550147');
  assert.equal(qr.value, decoded[0].text);
});

test('changing the contact produces a different QR; maximal valid payload fits the phone card', () => {
  const first = createContactQr('+12025550147', true);
  const second = createContactQr('+12025550148', true);
  assert.ok(first && second);
  assert.notDeepEqual(first.bars, second.bars);
  assert.equal(second.value, '+12025550148');
  const longest = createContactQr('+123456789012345', true);
  assert.ok(longest);
  assert.ok(longest.size * 6 <= 222, 'integer-sized modules fit a 320px screen');
});
