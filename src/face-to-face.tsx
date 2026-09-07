import { Pressable, Text, TextInput, SafeAreaView, Ionicons, useLocale } from './localized-ui';

import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useReducedMotion } from 'react-native-reanimated';
import { Message, Sender } from './conversation-model';
import type { useSpeechInput } from './use-speech-input';
import { colors } from './theme';
import { FtfMotion } from './ftf-motion';

const phrases = ['Yes', 'No', 'Thank you', 'Please call my family', 'Please type your response', 'Please help me'];
type Props = {
  messages: Message[];
  drafts: Record<Sender, string>;
  labels: Record<Sender, string>;
  onDraft(sender: Sender, text: string): void;
  onSend(text: string, sender: Sender): void;
  onBack(): void;
  onChat(): void;
  voice: ReturnType<typeof useSpeechInput>;
  speechLocale: string;
  onSpeechLocale(): void;
};

export function FaceToFace({ messages, drafts, labels, onDraft, onSend, onBack, onChat, voice, speechLocale, onSpeechLocale }: Props) {
  const { height } = useWindowDimensions();
  const { t, language } = useLocale();
  const compact = height < 600;
  const [editor, setEditor] = useState<{ sender: Sender; mode: 'phrases' } | null>(null);
  const recordingSender = voice.busy ? voice.owner : null;
  const [reading, setReading] = useState<{ sender: Sender; id: number } | null>(null);
  const [barOwner, setBarOwner] = useState<Sender>('you');
  const initialLastId = useRef(messages.at(-1)?.id ?? 0);
  const youInput = useRef<TextInput>(null);
  const partnerInput = useRef<TextInput>(null);
  const [notice, setNotice] = useState<Partial<Record<Sender, string>>>({});
  const playback = useRef(0);
  const youScroll = useRef<ScrollView>(null);
  const partnerScroll = useRef<ScrollView>(null);
  const reducedMotion = useReducedMotion();
  const scrollFrames = useRef<Partial<Record<Sender, number>>>({});
  const scrollToLatest = useCallback((sender: Sender, animated = true) => {
    const pending = scrollFrames.current[sender];
    if (pending !== undefined) cancelAnimationFrame(pending);
    // Wait for the new viewport/content layout, including a keyboard or phrase-picker change.
    scrollFrames.current[sender] = requestAnimationFrame(() => {
      (sender === 'you' ? youScroll : partnerScroll).current?.scrollToEnd({ animated: animated && !reducedMotion });
    });
  }, [reducedMotion]);
  useEffect(() => { playback.current++; setReading(null); void Speech.stop().catch(() => {}); }, [language]);
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    scrollToLatest('you');
    scrollToLatest('partner');
  }, [lastMessageId, editor?.sender, scrollToLatest]);
  useEffect(() => () => {
    Object.values(scrollFrames.current).forEach(cancelAnimationFrame);
    playback.current++;
    void Speech.stop().catch(() => {});
  }, []);

  const stopRead = async () => {
    playback.current++;
    setReading(null);
    if (reading) setNotice(previous => ({ ...previous, [reading.sender]: 'Reading stopped.' }));
    try { await Speech.stop(); } catch { /* An unavailable speech engine is reported by Read. */ }
  };
  const read = async (sender: Sender, message: Message) => {
    const value = message.text;
    setBarOwner(sender);
    if (reading?.sender === sender && reading.id === message.id) { await stopRead(); return; }
    const id = ++playback.current;
    setReading({ sender, id: message.id });
    setNotice(previous => ({ ...previous, ...(reading ? { [reading.sender]: 'Reading stopped.' } : {}), [sender]: 'Reading aloud…' }));
    const finish = (message: string) => {
      if (id !== playback.current) return;
      setReading(null);
      setNotice(previous => ({ ...previous, [sender]: message }));
    };
    try {
      await Speech.stop();
      if (id !== playback.current) return;
      Speech.speak(value, {
        language: /[؀-ۿ]/.test(value) ? 'ur-PK' : 'en-US',
        onDone: () => finish('Finished reading.'),
        onStopped: () => finish('Reading stopped.'),
        onError: () => finish('Audio unavailable. Read the message on screen or check device voices.'),
      });
    } catch { finish('Audio unavailable on this device. The message is still visible.'); }
  };
  const startVoice = (sender: Sender) => {
    if (voice.busy) return;
    void stopRead();
    setBarOwner(sender);
    setEditor(null);
    setNotice(previous => ({ ...previous, [sender]: undefined }));
    voice.start(sender, drafts[sender], speechLocale);
  };
  const send = (sender: Sender, value: string, clearDraft = false) => {
    if (!value.trim()) return;
    setBarOwner(sender);
    onSend(value, sender);
    if (clearDraft) onDraft(sender, '');
    setEditor(null);
    setNotice(previous => ({ ...previous, [sender]: t('Sent to {name}.', { name: t(sender === 'you' ? 'Partner' : 'You') }) }));
  };

  const panel = (sender: Sender) => {
    const name = t(sender === 'you' ? 'You' : 'Partner');
    const scroll = sender === 'you' ? youScroll : partnerScroll;
    const input = sender === 'you' ? youInput : partnerInput;
    const choosing = editor?.sender === sender && editor.mode === 'phrases';
    return <View key={sender} testID={'ftf-panel-' + sender} style={[s.half, sender === 'partner' && s.rotated]}>
      <View style={[s.identity, compact && s.identityCompact]}>
        {!compact && <View style={s.identityIcon}><Ionicons name="person-outline" size={20} color={colors.primaryDark} accessible={false} /></View>}
        <View style={[s.identityText, compact && s.identityTextCompact]}><Text style={s.name}>{name}<Text style={s.personCode}>  /  {sender === 'you' ? 'A' : 'B'}</Text></Text><Text style={s.profile}>{labels[sender]}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={name + ': ' + t('Speech language') + ': ' + t(speechLocale === 'ur-PK' ? 'Urdu' : 'English') + '. ' + t('Switch language')} accessibilityState={{ disabled: voice.busy }} disabled={voice.busy} onPress={onSpeechLocale} style={s.languageButton}><Ionicons name="language-outline" size={16} color={colors.primaryDark} accessible={false}/><Text style={s.languageText}>{speechLocale === 'ur-PK' ? 'اردو' : 'EN'}</Text></Pressable>
      </View>

      {choosing ? <View testID={'ftf-phrases-' + sender} style={s.picker}>
        <View style={s.pickerHeading}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={s.pickerTitle}>Quick phrases</Text><Text style={s.pickerHint}>{t('Tap to send as {name}', { name })} · {t('Not your chat history')}</Text></View><IconButton icon="close" label={name + ': ' + t('Close phrases')} onPress={() => setEditor(null)} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.phrases}>
          {phrases.map(phrase => <Pressable key={phrase} accessibilityRole="button" accessibilityLabel={t('Send as {name}', { name }) + ': ' + t(phrase)} onPress={() => send(sender, t(phrase))} style={({ pressed }) => [s.phrase, pressed && s.pressed]}><Text style={s.phraseText}>{phrase}</Text><Ionicons name="arrow-up" size={16} color={colors.primaryDark} accessible={false} /></Pressable>)}
        </ScrollView>
      </View> : <ScrollView ref={scroll} testID={'ftf-history-' + sender} style={s.history} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.messages, compact && s.messagesCompact]}
        onLayout={() => scrollToLatest(sender, false)} onContentSizeChange={() => scrollToLatest(sender)}>
        {messages.length === 0 && <Text style={s.empty}>Your conversation starts here. Type a message or choose a phrase.</Text>}
        {messages.map(message => {
          const own = message.sender === sender;
          const playing = reading?.sender === sender && reading.id === message.id;
          return <FtfMotion key={message.id} enter={message.id > initialLastId.current} style={[s.messageRow, own && s.ownRow]}>
            <View testID={'ftf-' + sender + '-message-' + message.id} accessibilityLabel={t(own ? 'Sent by {name}' : 'Received by {name}', { name }) + ': ' + message.text} style={[s.bubble, own ? s.outgoing : s.incoming]}>
              <Text verbatim style={[s.message, /[؀-ۿ]/.test(message.text) && s.rtl]}>{message.text}</Text>
            </View>
            {!own && <IconButton icon={playing ? 'stop-outline' : 'volume-medium-outline'} label={name + ': ' + (playing ? t('Stop audio') : t('Read aloud') + ': ' + message.text)} selected={playing} disabled={voice.busy} onPress={() => void read(sender, message)} />}
          </FtfMotion>;
        })}
      </ScrollView>}

      <View style={[s.dock, compact && s.dockCompact]}>
        {(!!notice[sender] || voice.owner === sender && !!voice.message) && <ScrollView style={s.status} keyboardShouldPersistTaps="handled">
          {!!notice[sender] && !(compact && /^(Sent to|Finished reading|Reading stopped)/.test(notice[sender]!)) && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice[sender]}</Text>}
          {voice.owner === sender && !!voice.message && <View style={s.voiceNotice}><Text accessibilityLiveRegion="polite" style={[s.notice, { flex: 1 }]}>{voice.message}</Text>{!voice.busy && <IconButton icon="close" label={name + ': ' + t('Dismiss voice notice')} onPress={voice.clearFeedback} />}</View>}
          {recordingSender === sender && !!voice.preview && <Text verbatim style={s.voicePreview}>{voice.preview}</Text>}
        </ScrollView>}
        <View style={s.composer}>
          <IconButton icon={recordingSender === sender ? 'stop-outline' : 'mic-outline'} label={name + ': ' + t(recordingSender === sender ? 'Stop voice input' : 'Start voice input')} selected={recordingSender === sender} disabled={voice.busy && recordingSender !== sender} onPress={() => recordingSender === sender ? voice.stop() : startVoice(sender)} />
          <View style={[s.inputShell, !!drafts[sender].trim() && s.inputActive]}>
            <TextInput ref={input} testID={'ftf-input-' + sender} accessibilityLabel={t('FTF message from {name}', { name })} editable={!voice.busy} value={drafts[sender]} onChangeText={value => onDraft(sender, value)}
              onFocus={() => { setBarOwner(sender); setEditor(null); }} placeholder="Type a message…" placeholderTextColor={colors.muted} multiline style={s.input} />
            {!!drafts[sender].trim() && <IconButton icon="arrow-up" label={name + ': ' + t('Send')} selected disabled={voice.busy} onPress={() => send(sender, drafts[sender], true)} />}
          </View>
          <IconButton icon={recordingSender === sender || choosing ? 'close' : 'chatbubble-ellipses-outline'} label={name + ': ' + t(recordingSender === sender ? 'Cancel voice input' : choosing ? 'Close phrases' : 'Phrases')} selected={choosing} disabled={voice.busy && recordingSender !== sender}
            onPress={() => { if (recordingSender === sender) { voice.cancel(); return; } setBarOwner(sender); setEditor(choosing ? null : { sender, mode: 'phrases' }); }} />
        </View>
        {!compact && <Text style={s.privacyHint}>Device speech may process audio online.</Text>}
      </View>
    </View>;
  };

  return <SafeAreaView style={s.safe}>
    <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {panel('partner')}
      <View style={s.dividerFrame}>
        <FtfMotion rotation={barOwner === 'partner' ? 180 : 0} style={[s.divider, compact && s.dividerCompact]}>
          <IconButton icon="arrow-back" label="Back" inverse onPress={onBack} />
          <Pressable testID="ftf-flip" accessibilityRole="button" accessibilityLabel={t('Flip central controls to {name}', { name: t(barOwner === 'you' ? 'Partner' : 'You') })} accessibilityHint="Only the central navigation rotates. Message senders stay the same."
            onPress={() => setBarOwner(previous => previous === 'you' ? 'partner' : 'you')} style={({ pressed }) => [s.flip, pressed && s.pressed]}>
            <View style={s.modeRow}><Text style={s.mode}>Face to face</Text><Ionicons name="sync-outline" size={16} color={colors.surface} accessible={false} /></View>
            <Text style={s.flipHint}>{t('Facing {name}', { name: t(barOwner === 'you' ? 'You' : 'Partner') })} · {t('Tap to flip')}</Text>
          </Pressable>
          <IconButton icon="chatbubbles-outline" label="Back to chat" inverse onPress={onChat} />
        </FtfMotion>
      </View>
      {panel('you')}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function IconButton({ icon, label, selected = false, inverse = false, disabled = false, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; selected?: boolean; inverse?: boolean; disabled?: boolean; onPress(): void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.iconButton, selected && s.iconSelected, inverse && s.iconInverse, (disabled || pressed) && s.pressed]}>
    <Ionicons name={icon} size={22} color={selected || inverse ? colors.surface : colors.primaryDark} accessible={false} />
  </Pressable>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, half: { flex: 1, minHeight: 0, overflow: 'hidden' }, rotated: { transform: [{ rotate: '180deg' }] },
  identity: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.line },
  identityIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, minWidth: 0 }, name: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink }, personCode: { fontSize: 12, fontWeight: '500', color: colors.muted },
  identityCompact: { minHeight: 44, paddingVertical: 0 }, identityTextCompact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  profile: { fontSize: 12, lineHeight: 17, color: colors.muted }, localLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, color: colors.primaryDark },
  history: { flex: 1, minHeight: 0 }, messages: { padding: 16, gap: 12, flexGrow: 1 }, empty: { fontSize: 16, lineHeight: 24, color: colors.muted },
  messagesCompact: { paddingVertical: 4, gap: 8 },
  messageRow: { width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center' }, ownRow: { justifyContent: 'flex-end' },
  bubble: { flexShrink: 1, maxWidth: '84%', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderRadius: 18, borderWidth: 1 },
  incoming: { backgroundColor: colors.surface, borderColor: colors.line, borderBottomLeftRadius: 5 }, outgoing: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight, borderBottomRightRadius: 5 },
  message: { fontSize: 17, lineHeight: 24, color: colors.ink, fontWeight: '400' }, rtl: { writingDirection: 'rtl', textAlign: 'right' },
  dock: { backgroundColor: colors.surface, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderTopWidth: 1, borderColor: colors.line },
  dockCompact: { paddingVertical: 4 }, dividerCompact: { minHeight: 56, paddingVertical: 4 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8 }, inputShell: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, flexDirection: 'row', alignItems: 'center' },
  inputActive: { borderColor: colors.primary }, input: { flex: 1, minWidth: 0, height: 48, paddingHorizontal: 12, paddingVertical: 12, color: colors.ink, fontSize: 16, lineHeight: 22 },
  iconButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconSelected: { backgroundColor: colors.primaryDark }, iconInverse: { backgroundColor: colors.emeraldBlack }, pressed: { opacity: 0.55 },
  dockHint: { fontSize: 11, lineHeight: 16, color: colors.muted, textAlign: 'center', marginTop: 4 },
  notice: { fontSize: 12, lineHeight: 17, color: colors.primaryDark, marginBottom: 6 },
  voicePreview: { fontSize: 14, lineHeight: 20, color: colors.ink, marginBottom: 6 },
  status: { maxHeight: 64, flexGrow: 0 },
  voiceNotice: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  languageButton: { minHeight: 44, minWidth: 48, flexDirection: 'row', gap: 4, justifyContent: 'center', alignItems: 'center' }, languageText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark }, privacyHint: { fontSize: 10, lineHeight: 14, color: colors.muted, textAlign: 'center', marginTop: 4 },
  dividerFrame: { backgroundColor: colors.primaryDark, zIndex: 2 }, divider: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  flip: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', gap: 3 }, modeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mode: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.surface }, flipHint: { fontSize: 11, lineHeight: 15, color: colors.primaryLight },
  picker: { flex: 1, minHeight: 0, backgroundColor: colors.mint, borderTopWidth: 2, borderTopColor: colors.mintBright }, pickerHeading: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mintBright },
  pickerHint: { fontSize: 11, lineHeight: 16, color: colors.ink, marginTop: 2 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: colors.ink }, phrases: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  phrase: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  phraseText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.ink },
});
