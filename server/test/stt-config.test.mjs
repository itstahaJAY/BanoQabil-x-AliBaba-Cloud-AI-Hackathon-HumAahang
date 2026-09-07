import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../config.mjs';

const env = { OPENAI_API_KEY: 'a'.repeat(32), DEEPSEEK_API_KEY: 'b'.repeat(32), STT_CLIENT_TOKEN: 'c'.repeat(32) };

test('OpenAI is the default speech provider and shares only the server key with Vision', () => {
  const config = readConfig(env);
  assert.equal(config.sttProvider, 'openai');
  assert.equal(config.openaiSttModel, 'gpt-4o-transcribe');
  assert.equal(config.openaiVisionModel, 'gpt-4.1-mini');
  assert.equal(config.deepgramKey, undefined);
  assert.equal(config.openaiKey, env.OPENAI_API_KEY);
  assert.equal(readConfig({ ...env, OPENAI_STT_MODEL: 'gpt-4o-mini-transcribe' }).openaiSttModel, 'gpt-4o-mini-transcribe');
});

test('Deepgram rollback is explicit and does not require an OpenAI key', () => {
  const config = readConfig({ ...env, OPENAI_API_KEY: '', STT_PROVIDER: 'deepgram', DEEPGRAM_API_KEY: 'd'.repeat(32) });
  assert.equal(config.sttProvider, 'deepgram');
  assert.equal(config.openaiKey, undefined);
  assert.equal(config.deepgramKey, 'd'.repeat(32));
  assert.throws(() => readConfig({ ...env, STT_PROVIDER: 'deepgram' }), /DEEPGRAM_API_KEY/);
});

test('invalid provider/model and missing selected-provider or translation credentials fail closed', () => {
  assert.throws(() => readConfig({ ...env, STT_PROVIDER: 'automatic' }), /STT_PROVIDER/);
  assert.throws(() => readConfig({ ...env, OPENAI_STT_MODEL: 'gpt-live-transcribe' }), /OPENAI_STT_MODEL/);
  assert.throws(() => readConfig({ ...env, OPENAI_STT_MODEL: 'https://other.test' }), /OPENAI_STT_MODEL/);
  assert.throws(() => readConfig({ ...env, OPENAI_API_KEY: undefined, DEEPGRAM_API_KEY: 'd'.repeat(32) }), /OPENAI_API_KEY/);
  assert.throws(() => readConfig({ ...env, DEEPSEEK_API_KEY: undefined }), /DEEPSEEK_API_KEY/);
});
