import { Pressable, Text, SafeAreaView, Ionicons, useLocale } from '../src/localized-ui';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { router } from '../src/navigation';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Header } from '../src/components';
import { createTranscriptStorage, type SavedTranscript } from '../src/transcript-storage';
import { transcriptLanguageLabel } from '../src/caption-provider';
import { colors, radius, space } from '../src/theme';

const storage = createTranscriptStorage(AsyncStorage);
export default function History() {
  const { t, language } = useLocale();
  const [saved, setSaved] = useState<SavedTranscript[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading saved transcripts…');
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let current = true;
    setStatus('Loading saved transcripts…');
    void storage.list().then(items => {
      if (current) { setSaved(items); setStatus(items.length ? '' : 'No saved transcripts yet. Save one from Live Transcription.'); }
    }).catch(() => { if (current) setStatus('Could not read saved transcripts. Your stored data has not been changed.'); });
    return () => { current = false; };
  }, [retry]));
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Header back onBack={() => router.canGoBack() ? router.back() : router.replace('/')} title="History" subtitle="Saved text on this device. No audio is stored." />
    {!!status && <Text style={s.meta} accessibilityLiveRegion="polite">{status}</Text>}
    {status.startsWith('Could not') && <Pressable accessibilityRole="button" style={s.link} onPress={() => setRetry(value => value + 1)}><Text style={s.linkText}>Retry loading</Text></Pressable>}
    {saved.map(item => <View key={item.id} style={s.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Saved transcript') + ': ' + item.text.slice(0, 60)} accessibilityState={{ expanded: expanded === item.id }} onPress={() => setExpanded(previous => previous === item.id ? null : item.id)} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
        <Ionicons name="document-text-outline" size={24} color={colors.primaryDark} accessible={false} />
        <View style={s.copy}><Text verbatim numberOfLines={2} style={s.title}>{item.text}</Text><Text verbatim style={s.meta}>{new Date(item.savedAt).toLocaleString(language === 'اردو' ? 'ur-PK' : 'en-PK', { hour12: false })} · {t(transcriptLanguageLabel(item.language))}</Text></View>
        <Ionicons name={expanded === item.id ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primaryDark} accessible={false} />
      </Pressable>
      {expanded === item.id && <Text verbatim selectable style={s.transcript}>{item.text}</Text>}
    </View>)}
    <Pressable accessibilityRole="button" onPress={() => router.push('/transcription')} style={s.link}><Text style={s.linkText}>New transcription</Text></Pressable>
    <Text style={s.section}>Demo conversation shortcuts</Text>
    <Text style={s.meta}>These open example conversations, not saved sessions.</Text>
    {[['Deaf ↔ Hearing', 'hearing'], ['Mute ↔ Blind', 'blind']].map(([label, partner]) => <Pressable key={partner} accessibilityRole="button" onPress={() => router.push({ pathname: '/conversation', params: { partner } })} style={s.card}><Text style={s.title}>{label}</Text><Text style={s.meta}>Open demo conversation</Text></Pressable>)}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface }, row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 }, title: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: colors.ink }, meta: { fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 4 },
  transcript: { fontSize: 22, lineHeight: 34, color: colors.ink, marginTop: 16, writingDirection: 'auto' },
  link: { minHeight: 48, justifyContent: 'center' }, linkText: { fontSize: 15, color: colors.primaryDark, fontWeight: '600' }, section: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 24 },
});
