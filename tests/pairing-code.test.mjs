import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePairingCode } from '../src/pairing-code.ts';

test('pasted pairing code keeps all ten characters despite surrounding clipboard whitespace', () => {
  for (const pasted of [' 012345abcd ', '\n012345ABCD\r\n', '\t012345ABCD\u00a0']) {
    assert.equal(normalizePairingCode(pasted), '012345ABCD');
  }
});
test('spaces and hyphen separators can be pasted without changing the underlying ten-character code', () => {
  for (const pasted of ['01234-5ABCD', '01234 5abcd', ' 01-23-45-ab-cd ']) {
    assert.equal(normalizePairingCode(pasted), '012345ABCD');
  }
});
test('incorrect lengths, arbitrary text, URLs and API keys are rejected rather than truncated or extracted', () => {
  for (const pasted of ['', '123456789', '012345ABCDE', 'https://demo.example/012345ABCD', 'Code: 012345ABCD',
    'sk-012345ABCD', '012345ABCG', '012345ABCD@example.com', ' '.repeat(200) + '012345ABCD']) {
    assert.equal(normalizePairingCode(pasted), null);
  }
});
test('exact codes normalize case without changing their value', () => {
  assert.equal(normalizePairingCode('012345abcd'), '012345ABCD');
  assert.equal(normalizePairingCode('FFFFFFFFFF'), 'FFFFFFFFFF');
});
