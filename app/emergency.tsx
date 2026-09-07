import { Pressable, Text, SafeAreaView, Ionicons } from '../src/localized-ui';

import * as Speech from 'expo-speech';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Header } from '../src/components';
import { getContactQrCopy } from '../src/contact-qr-copy';
import { createEmergencyCall, idleCall } from '../src/emergency-call';
import { getEmergencyCopy } from '../src/emergency-copy';
import { EmergencyButton } from '../src/emergency-ui';
import { router } from '../src/navigation';
import { emergencyCallTarget, type CallKind } from '../src/profile-data';
import { createPhrasePlayback, idlePlayback } from '../src/quick-speak-model';
import { RecordingStatus } from '../src/recording-status';
import { useApp } from '../src/store';
import { colors, radius, space } from '../src/theme';

type Mode = CallKind | 'lost';
const icons = { medical: 'medical-outline', police: 'shield-checkmark-outline', family: 'call-outline', lost: 'compass-outline' } as const;

export default function Emergency() {
  const app = useApp(), copy = getEmergencyCopy(app.language), rtl = app.language === 'اردو';
  const [mode, setMode] = useState<Mode | null>(null), [playback, setPlayback] = useState(idlePlayback), [call, setCall] = useState(idleCall);
  const player = useRef<ReturnType<typeof createPhrasePlayback> | null>(null), phone = useRef<ReturnType<typeof createEmergencyCall> | null>(null);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    const voice = createPhrasePlayback(Speech, setPlayback);
    const dialer = createEmergencyCall(url => Linking.openURL(url), setCall);
    player.current = voice; phone.current = dialer;
    void Speech.getAvailableVoicesAsync().catch(() => {});
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { voice.stop(); dialer.cancel(); }
    });
    return () => { subscription.remove(); voice.dispose(); dialer.dispose(); player.current = null; phone.current = null; };
  }, []);
  useFocusEffect(useCallback(() => () => { player.current?.stop(); phone.current?.cancel(); }, []));
  const choose = (next: Mode | null) => {
    player.current?.stop(); phone.current?.cancel(); setMode(next); scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const navigate = (path: '/settings' | '/passport' | '/contact-qr' | '/conversation?partner=hearing&face=1') => {
    player.current?.stop(); phone.current?.cancel(); router.push(path);
  };
  const messageFor = (copy: ReturnType<typeof getEmergencyCopy>) => mode === 'lost' ? copy.lostMessage : mode === 'medical' ? copy.medicalMessage : mode === 'police' ? copy.policeMessage : mode === 'family' ? copy.familyMessage : app.passport.instructions || copy.hints[app.persona];
  const message = messageFor(copy);
  const spokenMessage = messageFor(getEmergencyCopy(app.language === 'Roman Urdu' ? 'اردو' : app.language));
  useEffect(() => { player.current?.stop(); phone.current?.cancel(); }, [app.language]);
  const target = mode && mode !== 'lost' && app.ready && !app.storageError ? emergencyCallTarget(mode, app) : null;
  const opening = call.phase === 'opening';
  const review = () => { if (target) { player.current?.stop(); phone.current?.review({ ...target, name: target.name || copy[target.kind] }); } };
  const issue = call.issue ? copy[call.issue] : '';

  return <SafeAreaView {...(Platform.OS === 'web' ? { dir: rtl ? 'rtl' : 'ltr', lang: rtl ? 'ur' : 'en' } : {})} style={[s.safe, Platform.OS !== 'web' && { direction: rtl ? 'rtl' : 'ltr' }]}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Header title={copy.title} subtitle={copy.subtitle} back onBack={() => mode ? choose(null) : router.dismissTo('/')} backLabel={copy.back}/>
    {!app.ready ? <View style={s.loading}><ActivityIndicator color={colors.primary}/><Text>{copy.loading}</Text></View> : app.storageError ?
      <View style={s.panel}><Text accessibilityRole="alert" style={s.error}>{copy.loadError}</Text><EmergencyButton label={copy.reload} onPress={app.reloadProfile}/><EmergencyButton label={copy.configureContact} secondary onPress={() => navigate('/settings')}/></View> :
      <>
        {mode ? <View style={s.modeHeading}><Ionicons name={icons[mode]} size={22} color="#A63346" accessible={false}/><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.modeTitle}>{copy[mode]}</Text></View> : null}
        <View style={s.messageCard}>
          <Text style={s.eyebrow}>{copy.communication}</Text>
          <Text verbatim selectable style={s.message}>{message}</Text>
          {playback.phase === 'idle' ? <EmergencyButton label={copy.speak} secondary onPress={() => { void player.current?.speak(message, spokenMessage); }}/> : <RecordingStatus title={playback.phase === 'preparing' ? copy.preparing : copy.speaking} active={playback.phase === 'speaking'} detail={copy.communication} action="stop" actionLabel={rtl ? 'بند کریں' : 'Stop'} accessibilityLabel={copy.stop} onAction={() => player.current?.stop()}/>}
          {playback.error ? <Text accessibilityRole="alert" style={s.error}>{copy.voiceFailed}</Text> : null}
        </View>

        {!mode ? <>
          {(['medical', 'police', 'lost', 'family'] as const).map(kind => <Pressable key={kind} accessibilityRole="button" accessibilityLabel={copy[kind]} onPress={() => choose(kind)} style={({ pressed }) => [s.option, pressed && s.pressed]}>
            <View style={s.optionIcon}><Ionicons name={icons[kind]} size={25} color="#A63346" accessible={false}/></View>
            <View style={{ flex: 1 }}><Text style={s.optionTitle}>{copy[kind]}</Text><Text style={s.hint}>{kind === 'lost' ? copy.lostHint : emergencyCallTarget(kind, app) ? copy[(kind + 'Hint') as 'medicalHint' | 'policeHint' | 'familyHint'] : copy.notConfigured}</Text></View>
            <Ionicons name="chevron-forward" size={19} color="#8D8295" accessible={false}/>
          </Pressable>)}
          <EmergencyButton label={copy.passport} secondary onPress={() => navigate('/passport')}/>
          <EmergencyButton label={getContactQrCopy(app.language).entry} secondary onPress={() => navigate('/contact-qr')}/>
        </> : mode === 'lost' ? <View style={s.panel}>
          <Text style={s.hint}>{copy.noTracking}</Text>
          <EmergencyButton label={copy.family} onPress={() => choose('family')}/>
          <EmergencyButton label={copy.ftf} secondary onPress={() => navigate('/conversation?partner=hearing&face=1')}/>
          <EmergencyButton label={copy.passport} secondary onPress={() => navigate('/passport')}/>
        </View> : <View style={s.panel}>
          {!target ? <>
            <Text accessibilityRole="header" style={s.optionTitle}>{copy.notConfigured}</Text>
            <Text style={s.body}>{mode === 'family' ? copy.noContact : copy.noService}</Text>
            <EmergencyButton label={mode === 'family' ? copy.configureContact : copy.configure} onPress={() => navigate('/settings')}/>
          </> : <>
            <Text verbatim accessibilityRole="header" style={s.optionTitle}>{call.phase === 'review' ? copy.confirmTitle : target.name || copy[mode]}</Text>
            {call.target?.name && call.phase === 'review' ? <Text verbatim style={s.body}>{call.target.name}</Text> : null}
            {(call.target || target).area ? <Text verbatim style={s.hint}>{copy.area}: {(call.target || target).area}</Text> : null}
            <Text style={s.eyebrow}>{copy.number}</Text>
            <Text verbatim selectable accessibilityLabel={copy.number + ': ' + (call.target || target).number} style={s.phone}>{(call.target || target).number}</Text>
            <Text style={s.body}>{copy.callNotice}</Text>
            {mode === 'family' ? <Text style={s.hint}>{copy.privateContact}</Text> : null}
            {call.phase === 'review' ? <>
              <EmergencyButton label={copy.confirm} onPress={() => { player.current?.stop(); void phone.current?.confirm(); }}/>
              <EmergencyButton label={copy.cancel} secondary onPress={() => phone.current?.cancel()}/>
            </> : opening ? <Text accessibilityLiveRegion="polite" style={s.notice}>{copy.opening}</Text> : <>
              {call.phase === 'requested' || issue ? <Text accessibilityRole={issue ? 'alert' : 'text'} accessibilityLiveRegion="polite" style={issue ? s.error : s.notice}>{issue || copy.requested}</Text> : null}
              <EmergencyButton label={copy.review} onPress={review}/>
            </>}
          </>}
        </View>}
        {mode ? <EmergencyButton label={copy.allOptions} secondary disabled={opening} onPress={() => choose(null)}/> : null}
      </>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: 40, gap: 12 }, loading: { minHeight: 160, justifyContent: 'center', alignItems: 'center', gap: 14 },
  messageCard: { backgroundColor: '#FFF0F2', borderWidth: 1, borderColor: '#F1D5DC', padding: 20, borderRadius: radius.lg, gap: 16 }, eyebrow: { fontSize: 11, lineHeight: 19, fontWeight: '700', letterSpacing: .5, color: '#923349', writingDirection: 'auto' }, message: { fontSize: 23, lineHeight: 36, color: colors.ink, fontWeight: '600', writingDirection: 'auto' },
  option: { minHeight: 82, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#EBE4EE' }, optionIcon: { width: 44, height: 46, borderRadius: 14, backgroundColor: '#FFF0F2', justifyContent: 'center', alignItems: 'center' }, optionTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 27, writingDirection: 'auto' },
  hint: { color: '#6B5D70', fontSize: 12, lineHeight: 21, writingDirection: 'auto' }, body: { color: '#4F435B', fontSize: 14, lineHeight: 24, writingDirection: 'auto' }, panel: { padding: 18, gap: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: '#E7DDEB', backgroundColor: colors.surface }, modeHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, modeTitle: { flex: 1, fontSize: 20, lineHeight: 30, fontWeight: '700', color: colors.ink, writingDirection: 'auto' },
  phone: { fontSize: 27, lineHeight: 38, color: colors.ink, fontWeight: '700', writingDirection: 'ltr', textAlign: 'center' }, notice: { fontSize: 13, lineHeight: 23, color: '#4F435B', padding: 12, backgroundColor: '#F3EFF9', borderRadius: radius.sm, writingDirection: 'auto' }, error: { color: '#A1263B', fontSize: 13, lineHeight: 23, writingDirection: 'auto' }, pressed: { opacity: .6 },
});
