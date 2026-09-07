export type Persona = 'deaf' | 'mute' | 'blind' | 'hearing';
export type InputMode = 'voice' | 'text' | 'quick-phrases' | 'camera';
export type OutputMode = 'large-text' | 'speech' | 'visual' | 'haptics';
export type CommunicationConfig = {
  userAInput: InputMode[]; userAOutput: OutputMode[]; userBInput: InputMode[]; userBOutput: OutputMode[];
  preferredAtoBConversion: string; preferredBtoAConversion: string; faceToFaceSupported: true;
};
export const personas: Record<Persona, { title: string; short: string; icon: string }> = {
  deaf: { title: 'Deaf / Hard of Hearing', short: 'I prefer clear visual text', icon: 'eye-outline' },
  mute: { title: 'Mute / Speech Difficulty', short: 'I type or use quick phrases', icon: 'chatbox-ellipses-outline' },
  blind: { title: 'Blind / Low Vision', short: 'I prefer voice and audio', icon: 'ear-outline' },
  hearing: { title: 'No Assistance Needed', short: 'I can speak, see and hear', icon: 'happy-outline' },
};
