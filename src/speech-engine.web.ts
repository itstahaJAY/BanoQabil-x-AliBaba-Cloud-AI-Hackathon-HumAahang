import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { RecognitionEngine } from './speech-input';

export const speechEngine: RecognitionEngine = ExpoSpeechRecognitionModule;
// The browser asks on start(); the package permission method is only a web stub.
export const permissionRequired = false;
export function speechUnavailable() {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Microphone dictation needs HTTPS on your phone. A plain HTTP PC-IP link cannot use it. Open a secure preview or use keyboard dictation.';
  }
  return undefined;
}
