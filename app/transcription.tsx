import { Pressable, Text, TextInput, SafeAreaView, Ionicons, useLocale } from '../src/localized-ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Header } from '../src/components';
import { router } from '../src/navigation';
import { useLiveCaptions } from '../src/use-live-captions';
import { captionSaveRecord, selectedCaptionText, type CaptionLanguage, type ManualCaption } from '../src/caption-view-model';
import { createTranscriptStorage } from '../src/transcript-storage';
import { colors, radius, space } from '../src/theme';
import { useApp } from '../src/store';
import { CaptionInputControl } from '../src/caption-input-control';

const storage = createTranscriptStorage(AsyncStorage);

export default function Transcription() {
  const { t, rtl } = useLocale();
  const { height } = useWindowDimensions();
  const voice = useLiveCaptions();
  const { prefs } = useApp();
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  // Output language is local presentation state, never microphone configuration.
  const [output, setOutput] = useState<CaptionLanguage>('ur');
  const [large, setLarge] = useState(false);
  const [manual, setManual] = useState<ManualCaption | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const id = useRef('transcript-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  const scroll = useRef<ScrollView>(null);
  const outputTabs = useRef<Array<React.ComponentRef<typeof Pressable> | null>>([]);
  const follow = useRef(true);
  const previousCount = useRef(voice.segments.length);
  const text = showManual && manual ? manual.text : selectedCaptionText(voice.segments, output);
  const textLanguage = showManual && manual ? manual.language : output;
  const record = captionSaveRecord(id.current, text, textLanguage, showManual, '');
  const alreadySaved = saved[record.id] === record.text;
  const direction = textLanguage === 'ur' ? s.urdu : s.english;
  const transitioning = voice.phase === 'connecting' || voice.phase === 'stopping';
  const micDisabled = !voice.connected || voice.phase === 'stopping' || saving || feedbackBusy || (voice.inputLanguageLocked && !voice.busy);
  const micLabel = voice.phase === 'stopping' ? 'Finishing captions' : voice.phase === 'connecting' ? 'Cancel microphone start' : voice.phase === 'listening' ? 'Stop microphone' : voice.phase === 'error' ? 'Retry microphone' : 'Start microphone';

  useEffect(() => {
    if (voice.segments.length > previousCount.current && follow.current && !showManual) scroll.current?.scrollToEnd({ animated: false });
    previousCount.current = voice.segments.length;
  }, [voice.segments.length, showManual]);

  const save = async () => {
    if (saving || voice.busy || editing || !text.trim() || alreadySaved) return;
    setSaving(true);
    setNotice('');
    try {
      await storage.save({ ...record, savedAt: new Date().toISOString() });
      setSaved(previous => ({ ...previous, [record.id]: record.text }));
      setNotice('Saved on this device. Open History to read it again.');
    } catch {
      setNotice('Could not save. Your transcript is still here; check device storage and try again.');
    } finally { setSaving(false); }
  };
  const toggleCapture = () => {
    if (micDisabled) return;
    setNotice('');
    if (voice.phase === 'connecting') { voice.cancel(); return; }
    if (voice.phase === 'listening') { voice.stop(); return; }
    setEditing(false);
    setShowManual(false);
    void voice.start();
  };
  const edit = () => {
    if (editing) { setEditing(false); return; }
    if (!manual) setManual({ text: selectedCaptionText(voice.segments, output), language: output });
    setShowManual(true);
    setEditing(true);
    setNotice('');
  };
  const leave = (history = false) => {
    voice.cancel();
    if (history) router.push('/history');
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/assist');
  };

  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Header back onBack={() => leave()} title="Live Captions" />
      <CaptionInputControl value={voice.inputLanguage} disabled={voice.inputLanguageLocked || saving} gesturesEnabled={prefs.gestures} onSelect={voice.setInputLanguage} onFeedbackBusy={setFeedbackBusy}/>
      {!voice.connected && <Pressable accessibilityLabel="Open speech setup" onPress={() => router.push('/speech-setup')} style={s.setupLink}>
        <Ionicons name="information-circle-outline" size={20} color={colors.primaryDark} accessible={false}/><Text style={s.setupText}>Demo setup needed</Text><Text style={s.setupAction}>Set up</Text><Ionicons name="chevron-forward" size={16} color={colors.primaryDark} accessible={false}/>
      </Pressable>}
      <Pressable accessibilityLabel={micLabel} accessibilityHint="Sends microphone audio to the configured speech provider and finalized text to DeepSeek." accessibilityState={{ disabled: micDisabled, busy: transitioning }} {...(Platform.OS === 'web' ? { 'aria-busy': transitioning } : {})} disabled={micDisabled} onPress={toggleCapture} style={({ pressed }) => [s.microphone, voice.phase === 'listening' && s.recording, (pressed || micDisabled) && s.dim]}>
        <View style={s.micIcon}>{transitioning ? <ActivityIndicator color={colors.surface} /> : <Ionicons name={voice.phase === 'listening' ? 'stop' : 'mic-outline'} size={28} color={colors.surface} accessible={false} />}</View>
        <View style={s.copy}><Text style={s.micTitle}>{micLabel}</Text><Text style={s.micDetail}>{voice.phase === 'listening' ? 'Listening · tap to stop' : voice.phase === 'stopping' ? 'Microphone off · processing captured speech' : 'Speak in your selected language'}</Text></View>
      </Pressable>
      <Text style={s.privacy}>Cloud speech · DeepSeek translation</Text>
      {!!voice.message && <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[s.notice, s.errorNotice]}>{voice.message}</Text>}

      {!showManual ? <View>
        <Text style={[s.sectionLabel, s.outputLabel]}>Read in</Text>
        <View style={s.tabs} accessibilityRole="tablist" accessibilityLabel={t('Caption output language')}>
          {(['ur', 'en'] as const).map((value, index) => <Pressable key={value} ref={element => { outputTabs.current[index] = element; }} accessibilityRole="tab" accessibilityLabel={value === 'ur' ? 'Urdu output' : 'English output'} accessibilityState={{ selected: output === value }} {...(Platform.OS === 'web' ? { 'aria-selected': output === value, tabIndex: output === value ? 0 : -1, onKeyDown: (event: { key: string; preventDefault(): void }) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + (event.key === 'ArrowRight' ? (rtl ? -1 : 1) : (rtl ? 1 : -1)) + 2) % 2;
            setOutput(next === 0 ? 'ur' : 'en'); setNotice(''); outputTabs.current[next]?.focus();
          } } : {})} onPress={() => { setOutput(value); setNotice(''); }} style={({ pressed }) => [s.tab, output === value && s.selectedTab, pressed && s.dim]}>
            <Text verbatim style={[s.tabLabel, output === value && s.selectedTabLabel]}>{value === 'ur' ? 'اردو' : 'English'}</Text>
          </Pressable>)}
        </View>
      </View> : <View style={s.manualHeader}>
        <Text style={s.sectionLabel}>Manual transcript · not translated</Text>
        <Text style={s.help}>Your edits do not change or translate the live captions.</Text>
        <Pressable onPress={() => { setShowManual(false); setEditing(false); setNotice(''); }} style={s.link}><Text style={s.linkText}>Return to live captions</Text></Pressable>
      </View>}

      <ScrollView ref={scroll} nestedScrollEnabled style={[s.transcript, { height: Math.max(240, Math.min(420, height - 480)) }]} keyboardShouldPersistTaps="handled" contentContainerStyle={s.transcriptContent} onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; follow.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 72; }} scrollEventThrottle={16}>
        {editing && manual ? <TextInput autoFocus accessibilityLabel="Edit manual transcript" multiline value={manual.text} onChangeText={value => { setManual(previous => previous ? { ...previous, text: value } : null); setNotice(''); }} style={[s.text, s.editor, direction, large && s.large]} placeholder="Type, paste, or use your keyboard microphone…" placeholderTextColor={colors.muted} textAlignVertical="top" /> : text ?
          <Text verbatim selectable style={[s.text, direction, large && s.large]} {...(Platform.OS === 'web' ? { lang: textLanguage, dir: textLanguage === 'ur' ? 'rtl' : 'ltr' } : {})}>{text}</Text> : <View style={s.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={30} color={colors.primaryDark} accessible={false} />
            <Text style={s.emptyTitle}>{voice.busy ? 'Listening for your words' : 'Your captions appear here'}</Text>
            <Text style={s.emptyText}>{voice.busy ? 'Preparing your captions…' : 'Choose a speaking language, then tap the mic.'}</Text>
          </View>}
        {voice.pending > 0 && !showManual && <View style={s.processing} accessibilityLiveRegion="polite"><ActivityIndicator size="small" color={colors.primaryDark} /><Text verbatim style={s.processingText}>{t('Preparing {count} caption segments…', { count: voice.pending })}</Text></View>}
      </ScrollView>

      {voice.phase === 'stopping' && <Pressable onPress={voice.cancel} style={s.link}><Text style={s.linkText}>Cancel pending captions · keep completed text</Text></Pressable>}
      {editing && <Pressable onPress={() => setEditing(false)} style={s.link}><Text style={s.linkText}>Done editing</Text></Pressable>}
      <View style={s.controls}>
        <Pressable accessibilityLabel="More caption options" accessibilityState={{ expanded: moreOpen }} aria-expanded={moreOpen} onPress={() => setMoreOpen(value => !value)} style={s.moreToggle}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.primaryDark} accessible={false}/><Text style={s.linkText}>More</Text><Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primaryDark} accessible={false}/>
        </Pressable>
        {!!text.trim() && <Control icon="bookmark-outline" label={saving ? 'Saving…' : alreadySaved ? 'Saved' : 'Save'} disabled={voice.busy || editing || saving || alreadySaved} onPress={() => { void save(); }} />}
      </View>
      {moreOpen && <View style={s.morePanel}>
        <View style={s.controls}>
          <Control icon="text-outline" label={large ? 'Standard size' : 'Larger text'} onPress={() => setLarge(previous => !previous)} />
          <Control icon="time-outline" label="History" onPress={() => leave(true)} />
        </View>
        {!editing && <Pressable disabled={voice.busy || saving} accessibilityState={{ disabled: voice.busy || saving }} onPress={edit} style={({ pressed }) => [s.link, (pressed || voice.busy || saving) && s.dim]}><Text style={s.linkText}>{manual ? 'Edit manual transcript' : 'Type a manual transcript'}</Text></Pressable>}
        <Pressable disabled={voice.busy || saving} onPress={() => router.push('/speech-setup')} style={s.link}><Text style={s.linkText}>Speech setup</Text></Pressable>
        <Text style={s.privacy}>Starting sends audio to OpenAI (or Deepgram if the operator selects rollback), and finalized text to DeepSeek for both translations. Check important details; AI can make mistakes.</Text>
        <Text style={s.privacy}>{voice.busy ? 'Stop recording and wait for processing before editing or saving.' : 'Save keeps only the displayed text on this device, not audio. Local storage is not encrypted by this app.'}</Text>
      </View>}
      {!!notice && <Text style={s.notice} accessibilityLiveRegion="polite">{notice}</Text>}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

function Control({ icon, label, disabled, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; disabled?: boolean; onPress?(): void }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityState={{ disabled }} accessibilityLabel={label} style={({ pressed }) => [s.control, (pressed || disabled) && s.dim]}>
    <Ionicons name={icon} size={21} color={colors.primaryDark} accessible={false} /><Text style={s.controlText}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: space.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
  microphone: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.primaryDark, borderRadius: radius.lg },
  recording: { backgroundColor: '#5532C8' }, micIcon: { width: 52, height: 52, backgroundColor: '#FFFFFF20', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  copy: { flex: 1 }, micTitle: { color: colors.surface, fontSize: 18, lineHeight: 25, fontWeight: '700' }, micDetail: { color: colors.surface, fontSize: 12, lineHeight: 18, marginTop: 4 },
  privacy: { fontSize: 12, lineHeight: 19, color: '#625D71', marginTop: 8 }, help: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  setupLink: { minHeight: 48, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: colors.primaryLight, borderRadius: radius.sm }, setupText: { flex: 1, color: colors.ink, fontSize: 13 }, setupAction: { fontWeight: '700', color: colors.primaryDark, fontSize: 13 },
  outputLabel: { marginTop: 16 }, moreToggle: { flex: 1, minHeight: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, morePanel: { marginTop: 8, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 8 }, tabs: { flexDirection: 'row', backgroundColor: colors.primaryLight, padding: 4, borderRadius: radius.md, gap: 4 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' }, selectedTab: { backgroundColor: colors.surface, borderColor: '#D7CDF9' },
  tabLabel: { fontSize: 16, lineHeight: 25, fontWeight: '500', color: colors.muted }, selectedTabLabel: { color: colors.primaryDark, fontWeight: '700' },
  transcript: { marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line }, transcriptContent: { padding: 20, gap: 16, flexGrow: 1 },
  text: { fontSize: 24, lineHeight: 40, fontWeight: '500', color: colors.ink }, urdu: { textAlign: 'right', writingDirection: 'rtl' }, english: { textAlign: 'left', writingDirection: 'ltr' }, large: { fontSize: 32, lineHeight: 50 },
  editor: { minHeight: 180, borderWidth: 1, borderColor: colors.primaryDark, borderRadius: radius.sm, padding: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 12 }, emptyTitle: { fontSize: 18, lineHeight: 26, fontWeight: '600', color: colors.ink, textAlign: 'center' }, emptyText: { fontSize: 14, lineHeight: 22, color: colors.muted, textAlign: 'center', maxWidth: 310 },
  processing: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 }, processingText: { flex: 1, color: colors.primaryDark, fontSize: 13, lineHeight: 20 },
  manualHeader: { padding: 12, borderRadius: radius.sm, backgroundColor: colors.yellow }, notice: { marginVertical: 8, color: colors.primaryDark, fontSize: 14, lineHeight: 22, padding: 12, backgroundColor: colors.primaryLight, borderRadius: radius.sm }, errorNotice: { color: '#8A2637', backgroundColor: colors.redSoft },
  link: { minHeight: 48, justifyContent: 'center', alignItems: 'flex-start' }, linkText: { fontSize: 14, fontWeight: '600', color: colors.primaryDark },
  controls: { flexDirection: 'row', gap: 8, marginTop: 12 }, control: { flex: 1, minHeight: 52, padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  controlText: { fontSize: 12, fontWeight: '600', color: colors.ink, textAlign: 'center' }, dim: { opacity: 0.5 },
});
