import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable, Text, SafeAreaView, Ionicons } from '../src/localized-ui';
import { Header } from '../src/components';
import { router } from '../src/navigation';
import { createJudgeAccessClient, judgeAccessMessages, takeJudgeAccessKey, type JudgeAccessState } from '../src/judge-access-client';
import { serviceCredentials } from '../src/service-connection';
import { colors, radius, space } from '../src/theme';

export default function JudgeDemo() {
  const [state, setState] = useState<JudgeAccessState>({ phase: 'idle', message: '' });
  const key = useRef<string | null>(null), captured = useRef(false);
  const client = useRef<ReturnType<typeof createJudgeAccessClient> | null>(null);
  useEffect(() => {
    if (!captured.current) {
      captured.current = true;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try { key.current = takeJudgeAccessKey(window.location, url => window.history.replaceState(window.history.state, '', url)); }
        catch { key.current = null; }
      }
    }
    const connection = createJudgeAccessClient({ origin: typeof window !== 'undefined' ? window.location.origin : '', credentials: serviceCredentials, onState: setState });
    client.current = connection;
    let alive = true;
    // React Strict Mode may replay setup/cleanup. Defer so the discarded mount makes no request.
    void Promise.resolve().then(() => {
      if (!alive) return;
      if (key.current) void connection.connect(key.current);
      else if (serviceCredentials.current && serviceCredentials.current.expiresAt > Date.now()) setState({ phase: 'connected', message: '' });
      else setState({ phase: 'error', message: judgeAccessMessages.missing });
    });
    return () => { alive = false; connection.dispose(); client.current = null; };
  }, []);
  const busy = state.phase === 'connecting' || state.phase === 'idle';
  const connected = state.phase === 'connected';
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Header title="Welcome to Hum Ahang" subtitle="Private judge preview"/>
    <View style={s.card}>
      <View style={s.icon}>{busy ? <ActivityIndicator color={colors.primaryDark}/> : <Ionicons name={connected ? 'checkmark-circle-outline' : 'link-outline'} size={32} color={colors.primaryDark} accessible={false}/>}</View>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.title}>{busy ? 'Preparing your demo…' : connected ? (key.current ? 'Your demo is ready' : 'Continue your demo') : 'Demo connection needs attention'}</Text>
      {!!state.message && <Text accessibilityRole="alert" style={s.message}>{state.message}</Text>}
      {connected && <><Text style={s.help}>{key.current ? 'Speech and photo features are connected. Choose a feature to begin.' : 'Your existing connection has not been rechecked. Reopen the original private demo link if a feature asks to reconnect.'}</Text><Pressable accessibilityLabel="Enter demo" onPress={() => router.replace('/')} style={s.primary}><Text style={s.primaryText}>Enter demo</Text><Ionicons name="arrow-forward" size={19} color={colors.surface} accessible={false}/></Pressable></>}
      {!busy && !connected && !!key.current && <Pressable accessibilityLabel="Retry demo connection" onPress={() => { if (key.current) void client.current?.connect(key.current); }} style={s.primary}><Text style={s.primaryText}>Retry demo connection</Text></Pressable>}
      {!busy && !connected && <Pressable onPress={() => router.replace('/')} style={s.secondary}><Text style={s.secondaryText}>Explore without cloud features</Text></Pressable>}
    </View>
    <View style={s.privacy}><Ionicons name="shield-checkmark-outline" size={21} color={colors.primaryDark} accessible={false}/><Text style={s.help}>No microphone or camera starts automatically. This temporary connection stays only in this open app. After a reload or expiry, reopen the original private demo link.</Text></View>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: space.xl, gap: space.md },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: 16 },
  icon: { width: 56, height: 56, backgroundColor: colors.primaryLight, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 23, lineHeight: 31, fontWeight: '700' }, help: { color: colors.muted, fontSize: 14, lineHeight: 23, flexShrink: 1 },
  message: { color: colors.ink, backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: 12, fontSize: 14, lineHeight: 23 },
  primary: { minHeight: 52, padding: 12, borderRadius: radius.sm, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '700' }, secondary: { minHeight: 48, padding: 10, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: colors.primaryDark, fontSize: 14, fontWeight: '600' },
  privacy: { flexDirection: 'row', gap: 10, paddingVertical: space.md },
});
