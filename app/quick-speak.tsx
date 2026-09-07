import { Pressable, Text, TextInput, SafeAreaView, Ionicons, useLocale } from '../src/localized-ui';

import * as Speech from 'expo-speech';
import { useFocusEffect } from 'expo-router';
import { router } from '../src/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';

import { translate } from '../src/locale';
import { Header } from '../src/components';
import { RecordingStatus } from '../src/recording-status';
import { createPhrasePlayback, idlePlayback, phraseCategories, phrasesFor, type PhraseCategory } from '../src/quick-speak-model';
import { colors, radius, space } from '../src/theme';

export default function QuickSpeak() {
  const { t, language } = useLocale();
  useEffect(() => { player.current?.stop(); }, [language]);
  const [category, setCategory] = useState<PhraseCategory>('Favorites');
  const [playback, setPlayback] = useState(idlePlayback);
  const [custom, setCustom] = useState('');
  const player = useRef<ReturnType<typeof createPhrasePlayback> | null>(null);
  useEffect(() => {
    const controller = createPhrasePlayback(Speech, setPlayback);
    player.current = controller;
    // Initialize the lazy native TTS engine before the first tap; never play silent filler.
    void Speech.getAvailableVoicesAsync().catch(() => {});
    const subscription = AppState.addEventListener('change', state => { if (state === 'background') controller.stop(); });
    return () => { subscription.remove(); controller.dispose(); player.current = null; };
  }, []);
  useFocusEffect(useCallback(() => () => player.current?.stop(), []));
  const phrases = phrasesFor(category);
  return <SafeAreaView style={s.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Header back onBack={() => router.canGoBack() ? router.back() : router.replace('/')} title="Quick Speak" subtitle="Your words, spoken aloud." />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
      {phraseCategories.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={({ pressed }) => [s.chip, category === item && s.chipOn, pressed && s.pressed]}>
        <Text style={[s.chipText, category === item && s.chipTextOn]}>{item}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={s.player}>
      {playback.phase !== 'idle' ? <RecordingStatus title={playback.phase === 'preparing' ? 'Preparing voice' : 'Speaking'} active={playback.phase === 'speaking'} detailVerbatim detail={playback.text} action="stop" accessibilityLabel="Stop speaking" onAction={() => player.current?.stop()} /> :
        <Text style={s.hint} accessibilityLiveRegion="polite">{playback.error || 'Tap a phrase to speak. Tap another to switch.'}</Text>}
    </View>
    <View style={s.section}><Text style={s.sectionTitle}>{category}</Text><Text style={s.hint}>{phrases.length} {phrases.length === 1 ? 'phrase' : 'phrases'}</Text></View>
    <View style={s.grid}>{phrases.map(phrase => <Pressable key={phrase.text} onPress={() => { void player.current?.speak(t(phrase.text), translate(language === 'Roman Urdu' ? 'اردو' : language, phrase.text)); }} accessibilityRole="button" accessibilityLabel={t('Speak') + ': ' + t(phrase.text)} style={({ pressed }) => [s.phrase, playback.text === t(phrase.text) && s.selectedPhrase, pressed && s.pressed]}>
      <View style={s.icon} accessible={false} accessibilityElementsHidden><Ionicons name={phrase.favorite ? 'star-outline' : 'volume-medium-outline'} size={22} color={colors.primaryDark} /></View>
      <Text style={s.phraseText}>{phrase.text}</Text>
      <Ionicons name="play-outline" size={18} color={colors.primaryDark} accessible={false} />
    </Pressable>)}</View>
    <Text style={[s.sectionTitle, { marginTop: 24 }]}>Say something else</Text>
    <View style={s.custom}><TextInput accessibilityLabel="Custom phrase" placeholder="Type your own phrase…" value={custom} onChangeText={setCustom} maxLength={300} multiline style={s.input} placeholderTextColor={colors.muted} />
      <Pressable accessibilityRole="button" accessibilityLabel="Speak custom phrase" accessibilityState={{ disabled: !custom.trim() }} disabled={!custom.trim()} onPress={() => { void player.current?.speak(custom); }} style={({ pressed }) => [s.customButton, (!custom.trim() || pressed) && s.pressed]}><Ionicons name="volume-medium-outline" size={22} color={colors.surface} accessible={false} /><Text style={s.chipTextOn}>Speak</Text></Pressable>
    </View>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' },
  filters: { gap: 8 }, chip: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.primaryDark }, chipText: { fontWeight: '600', fontSize: 14, color: colors.ink }, chipTextOn: { color: colors.surface, fontWeight: '600' },
  player: { marginTop: 16, minHeight: 80, justifyContent: 'center' }, hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 }, sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  grid: { gap: 10, marginTop: 12 }, phrase: { minHeight: 72, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  selectedPhrase: { borderColor: colors.primary, backgroundColor: colors.primaryLight }, icon: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  phraseText: { fontSize: 17, lineHeight: 24, fontWeight: '500', color: colors.ink, flex: 1 }, pressed: { opacity: 0.6 },
  custom: { marginTop: 12, gap: 12 }, input: { minHeight: 88, padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, fontSize: 16, lineHeight: 24, color: colors.ink, textAlignVertical: 'top' },
  customButton: { minHeight: 48, borderRadius: 16, backgroundColor: colors.primaryDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
});
