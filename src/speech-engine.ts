import { requireOptionalNativeModule } from 'expo';
import type { RecognitionEngine } from './speech-input';

// Optional lookup keeps Expo Go / older installed builds usable instead of crashing on import.
export const speechEngine = requireOptionalNativeModule<RecognitionEngine>('ExpoSpeechRecognition');
export const permissionRequired = true;
export function speechUnavailable() {
  return speechEngine ? undefined : 'Microphone dictation needs a new native build with speech recognition. Expo Go cannot run it. You can still type or use keyboard dictation.';
}
