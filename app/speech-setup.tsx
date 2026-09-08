import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable, Text, TextInput, SafeAreaView, Ionicons } from '../src/localized-ui';
import { Header } from '../src/components';
import { router } from '../src/navigation';
import { useLiveCaptions } from '../src/use-live-captions';
import { captionClientMessages } from '../src/caption-client';
import { normalizePairingCode } from '../src/pairing-code';
import { colors, radius, space } from '../src/theme';

export default function SpeechSetup() {
  const voice = useLiveCaptions();
  const [code, setCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (voice.connected) { setCode(''); setNotice(''); } }, [voice.connected]);
  const leave = () => {
    voice.cancel(); setCode('');
    if (router.canGoBack()) router.back(); else router.replace('/settings');
  };
  const connect = async () => {
    if (pairing || !code.trim()) return;
    const normalized = normalizePairingCode(code);
    if (!normalized) { setNotice(captionClientMessages.pairing_failed); return; }
    setPairing(true); setNotice('');
    try { await voice.connect(normalized); }
    catch { if (mounted.current) setNotice('Could not connect. Check the server and request a fresh pairing code.'); }
    finally { if (mounted.current) setPairing(false); }
  };
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Header back onBack={leave} title="Speech setup" subtitle="Connect once for this demo session"/>
      <View style={s.card}>
        <View style={s.statusRow}><View style={s.icon}><Ionicons name={voice.connected ? 'checkmark-circle-outline' : 'link-outline'} size={25} color={colors.primaryDark} accessible={false}/></View>
          <View style={s.flex}><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.title}>{voice.connected ? 'Speech server connected' : 'Demo operator setup'}</Text><Text style={s.help}>Ask the demo operator to connect this device. You do not need an API key.</Text></View>
        </View>
        {voice.connected ? <Pressable accessibilityRole="button" accessibilityLabel="Disconnect speech server" onPress={() => { voice.disconnect(); setNotice(''); }} style={s.secondary}><Ionicons name="unlink-outline" size={20} color={colors.primaryDark} accessible={false}/><Text style={s.secondaryText}>Disconnect speech server</Text></Pressable> : <>
          <Text style={s.help}>Use the one-time pairing code from your local speech server. Do not enter an API key.</Text>
          <Text style={s.label}>Pairing code</Text>
          <TextInput accessibilityLabel="Pairing code" value={code} onChangeText={value => { setCode(normalizePairingCode(value) ?? value); setNotice(''); }} placeholder="Enter pairing code" autoCapitalize="none" autoCorrect={false} secureTextEntry editable={!pairing} onSubmitEditing={() => { void connect(); }} style={s.input}/>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: pairing || !code.trim(), busy: pairing }} {...(Platform.OS === 'web' ? { 'aria-busy': pairing } : {})} disabled={pairing || !code.trim()} onPress={() => { void connect(); }} style={({ pressed }) => [s.primary, (pressed || pairing || !code.trim()) && s.dim]}><Text style={s.primaryText}>{pairing ? 'Connecting speech server…' : 'Connect'}</Text></Pressable>
        </>}
        {!!(notice || voice.message) && <Text accessibilityRole="alert" style={s.error}>{notice || voice.message}</Text>}
        <Text style={s.help}>Connection lasts up to one hour and is kept only while this app is running. Reloading or restarting the app may require setup again.</Text>
      </View>
      <View style={s.privacy}><Ionicons name="shield-checkmark-outline" size={21} color={colors.primaryDark} accessible={false}/><View style={s.flex}><Text style={s.title}>This page does not start the microphone.</Text><Text style={s.help}>Starting sends audio to OpenAI (or Deepgram if the operator selects rollback), and finalized text to DeepSeek for both translations. Check important details; AI can make mistakes.</Text></View></View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

const s = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: space.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { padding: space.md, gap: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  statusRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, icon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: '700' }, help: { color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 4 },
  label: { color: colors.ink, fontWeight: '600', fontSize: 14 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.primaryDark, borderRadius: radius.sm, padding: 12, color: colors.ink, backgroundColor: colors.cream, fontSize: 16, textAlign: 'left', writingDirection: 'ltr' },
  primary: { minHeight: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primaryDark, borderRadius: radius.sm, padding: 12 }, primaryText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  secondary: { minHeight: 52, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryText: { color: colors.primaryDark, fontSize: 14, fontWeight: '600' },
  privacy: { paddingVertical: space.lg, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, error: { color: '#8A2637', fontSize: 13, lineHeight: 21, padding: 12, backgroundColor: colors.redSoft, borderRadius: radius.sm }, dim: { opacity: 0.5 },
});
