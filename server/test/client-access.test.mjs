import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClientAccess } from '../client-access.mjs';

test('one-use pairing grants a distinct expiring origin-bound speech credential', () => {
  let now = 0;
  const access = createClientAccess({ now: () => now, codeTtlMs: 100, clientTtlMs: 500 });
  const code = access.newCode();
  const grant = access.pair(code, 'http://localhost:8081');
  assert.ok(grant?.token); assert.notEqual(grant.token, code);
  assert.equal(access.pair(code, 'http://localhost:8081'), null);
  assert.equal(access.authorize(`Bearer ${grant.token}`, 'http://localhost:8081'), true);
  assert.equal(access.authorize(`Bearer ${grant.token}`, undefined), false);
  now = 501; assert.equal(access.authorize(`Bearer ${grant.token}`, 'http://localhost:8081'), false);
});

test('expired/brute-forced pairing codes fail; revocation and restart clear grants', () => {
  let now = 0;
  const access = createClientAccess({ now: () => now, codeTtlMs: 100 });
  const expired = access.newCode(); now = 101;
  assert.equal(access.pair(expired), null);
  const locked = access.newCode();
  for (let i = 0; i < 5; i++) assert.equal(access.pair('incorrect'), null);
  assert.equal(access.pair(locked), null);
  const grant = access.pair(access.newCode()); assert.ok(grant);
  access.revoke(`Bearer ${grant.token}`, 'wrong-origin');
  assert.equal(access.authorize(`Bearer ${grant.token}`), true);
  access.revoke(`Bearer ${grant.token}`);
  assert.equal(access.authorize(`Bearer ${grant.token}`), false);
  const next = access.pair(access.newCode()); access.clear();
  assert.equal(access.authorize(`Bearer ${next.token}`), false);
});
