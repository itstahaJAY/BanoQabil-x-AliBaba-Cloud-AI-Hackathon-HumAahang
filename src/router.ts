import { CommunicationConfig, InputMode, OutputMode, Persona } from './types';

const capabilities: Record<Persona, { input: InputMode[]; output: OutputMode[] }> = {
  deaf: { input: ['text', 'voice'], output: ['large-text', 'visual', 'haptics'] },
  mute: { input: ['text', 'quick-phrases'], output: ['large-text', 'speech', 'visual'] },
  blind: { input: ['voice'], output: ['speech', 'haptics'] },
  hearing: { input: ['voice', 'text'], output: ['speech', 'large-text', 'visual'] },
};
const route = (from: Persona, to: Persona) => {
  if (from === 'mute') return to === 'deaf' ? 'Text → Large text' : 'Text → Speech';
  if (from === 'blind') return to === 'deaf' || to === 'mute' ? 'Voice → Large text' : 'Voice → Speech support';
  if (from === 'deaf') return to === 'blind' || to === 'hearing' ? 'Text → Speech' : 'Text → Large text';
  if (to === 'deaf' || to === 'mute') return 'Voice → Large text';
  return 'Voice conversation + visual assistance';
};
export function getCommunicationConfig(userA: Persona, userB: Persona): CommunicationConfig {
  return { userAInput: capabilities[userA].input, userAOutput: capabilities[userA].output,
    userBInput: capabilities[userB].input, userBOutput: capabilities[userB].output,
    preferredAtoBConversion: route(userA, userB), preferredBtoAConversion: route(userB, userA), faceToFaceSupported: true };
}
