import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { hasTranslation } from '../src/locale.ts';

// AST inventory includes internal keys and platform identifiers, not just UI copy.
// Keep this exemption list explicit so newly added English UI needs a translation.
const internal = new Set([
  '0 0 52px rgba(70,52,135,.12)', 'AbortError', 'AppProvider missing', 'Byte', 'Could not', 'Escape', 'ExpoSpeechRecognition', 'M',
  'addListener', 'contactName', 'contactPhone', 'en-PK', 'en-US', 'expo-speech-recognition/build/ExpoSpeechRecognitionModule.types',
  'familyHint', 'isRecognitionAvailable', 'largeText', 'medicalHint', 'medicalPhone', 'policeHint', 'policePhone', 'power2.inOut',
  'requestPermissionsAsync', 'showContact', 'showName', 'ur-Latn', 'ur-PK', 'voiceGuidance', 'androidIntentOptions',
  'ArrowLeft', 'ArrowRight', 'End', 'Content-Type', 'DELETE', 'POST', 'Origin', 'bufferedAmount', 'readyState',
  'AudioAPIModule', 'AudioManager', 'AudioRecorder', 'CaptureError', 'ConfigurationChange', 'DevicesNotFoundError',
  'Granted', 'NewDeviceAvailable', 'NoSuitableRouteForCategory', 'NotAllowedError', 'NotFoundError',
  'OldDeviceUnavailable', 'SecurityError', 'allowBluetoothHFP', 'defaultToSpeaker', 'playAndRecord', 'routeChange',
  'keyboardDidHide', 'keyboardDidShow', 'screenReaderChanged',
  'overFullScreen', 'reduceMotionChanged',
  'description,gesture,objects,spokenDescription,task,uncertain', 'mimeType',
]);
test('all inventoried app-owned English copy has Urdu and Roman Urdu entries', () => {
  const values = JSON.parse(execFileSync(process.execPath, ['scripts/locale-inventory.cjs'], { encoding: 'utf8' }));
  assert.deepEqual(values.filter(value => !internal.has(value) && !hasTranslation(value)), []);
});
