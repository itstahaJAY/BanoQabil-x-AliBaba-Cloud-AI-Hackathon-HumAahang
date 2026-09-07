// Only these stable codes cross the client boundary; never send Error.message from a provider.
export class SpeechError extends Error {
  constructor(code, stage) {
    super(code); this.name = 'SpeechError'; this.code = code;
    if (publicStages.has(stage)) this.stage = stage;
  }
}
export function errorCode(error, fallback = 'internal_error') {
  return error instanceof SpeechError && publicCodes.has(error.code) ? error.code : fallback;
}
export function errorStage(error, fallback) {
  return error instanceof SpeechError && publicStages.has(error.stage) ? error.stage : fallback;
}

const publicStages = new Set(['recognition_input', 'translation_request', 'translation_validation']);

const publicCodes = new Set(['invalid_result', 'unsupported_language', 'conversion_invalid',
  'conversion_timeout', 'conversion_unavailable', 'provider_unavailable', 'provider_interrupted',
  'queue_full', 'invalid_message', 'audio_limit', 'session_limit', 'drain_timeout', 'slow_client', 'internal_error']);
