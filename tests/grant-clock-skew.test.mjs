import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCaptionClient } from '../src/caption-client.ts';
import { createJudgeAccessClient } from '../src/judge-access-client.ts';

for (const kind of ['judge', 'pairing']) {
  for (const seconds of [3702, 86400]) {
    test(`${kind} grant ${seconds === 3702 ? 'accepts measured 102-second clock skew and clamps to one local hour' : 'rejects a far-future expiry'}`, async () => {
      const before = Date.now(), credentials = { current: null };
      const fetcher = async () => Response.json({ token: 'a'.repeat(43), expiresAt: before + seconds * 1000 }, { status: 201 });
      const common = { credentials, fetcher, onState() {} };
      const client = kind === 'judge' ? createJudgeAccessClient({ ...common, origin: 'https://demo.example' }) :
        createCaptionClient({ ...common, baseUrl: 'https://demo.example', createCapture() { throw new Error('Must not record'); }, createSocket() { throw new Error('Must not stream'); } });
      try {
        await client.connect(kind === 'judge' ? 'b'.repeat(43) : '012345ABCD');
        if (seconds === 3702) {
          assert.ok(credentials.current);
          assert.ok(credentials.current.expiresAt <= Date.now() + 3600000);
          assert.ok(credentials.current.expiresAt >= before + 3590000);
        } else assert.equal(credentials.current, null);
      } finally { client.dispose(); }
    });
  }
}
