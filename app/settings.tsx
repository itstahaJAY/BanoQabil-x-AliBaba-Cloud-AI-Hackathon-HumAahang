import { Pressable, Switch, Text, SafeAreaView, Ionicons } from '../src/localized-ui';

import { router } from '../src/navigation';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Header } from '../src/components';
import { useEffect, useState } from 'react';
import { languageChoices } from '../src/locale';
import { useApp } from '../src/store';
import { colors, radius, space } from '../src/theme';
import { getEmergencyCopy } from '../src/emergency-copy';

const labels = { largeText: 'Large text', highContrast: 'High contrast', voiceGuidance: 'Voice guidance', haptics: 'Haptic feedback', autoSpeak: 'Auto speak' };
export default function Settings() {
  const app = useApp(), emergencyCopy = getEmergencyCopy(app.language);
  const [language, setLanguage] = useState(app.language);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { setLanguage(app.language); }, [app.language]);
  async function saveLanguage() {
    setSaving(true); setNotice('');
    try { await app.saveLanguage(language); setNotice('Language saved.'); }
    catch { setNotice('Could not save. Your edits are still here; please retry.'); }
    finally { setSaving(false); }
  }
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Header back onBack={() => router.canGoBack() ? router.back() : router.replace('/profile')} title="Settings" subtitle="Adjust Hum Ahang to work comfortably for you."/>
    {app.storageError ? <View style={s.row}><View style={{ flex: 1 }}><Text accessibilityRole="alert" style={s.error}>{app.storageError}</Text><Pressable accessibilityRole="button" onPress={app.reloadProfile} style={s.retry}><Text style={s.link}>Reload saved profile</Text></Pressable></View></View> : null}
    <Text accessibilityRole="header" style={s.section}>Your passport</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Manage passport details" onPress={() => router.push('/passport-settings')} style={[s.row, s.passport]}>
      <View style={s.passportIcon}><Ionicons name="id-card-outline" size={25} color={colors.primaryDark}/></View>
      <View style={{ flex: 1 }}><Text style={s.title}>Passport details</Text><Text style={s.sub}>Name, communication preferences, contact and visibility</Text></View>
      <Ionicons name="chevron-forward" size={19} color={colors.primaryDark}/>
    </Pressable>
    <Text style={s.helper}>Manage details here. Your passport displays only what you choose to show.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={emergencyCopy.settingsTitle} onPress={() => router.push('/emergency-settings')} style={s.row}>
      <View style={s.passportIcon}><Ionicons name="medical-outline" size={25} color="#A63346"/></View><View style={{ flex: 1 }}><Text style={s.title}>{emergencyCopy.settingsTitle}</Text><Text verbatim style={s.sub}>{app.emergency.area || emergencyCopy.settingsSubtitle}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.primaryDark}/>
    </Pressable>
    <Text accessibilityRole="header" style={s.section}>Accessibility</Text>
    {Object.entries(labels).map(([key, label]) => <View style={s.row} key={key}><View style={{ flex: 1 }}><Text style={s.title}>{label}</Text><Text style={s.sub}>{key === 'largeText' ? 'Increase important text throughout the app' : key === 'voiceGuidance' ? 'Hear key navigation and status changes' : 'Use automatically when it helps'}</Text></View><Switch accessibilityLabel={label} disabled={!app.ready || !!app.storageError} value={app.prefs[key as keyof typeof app.prefs]} onValueChange={value => app.setPrefs({ ...app.prefs, [key]: value })} trackColor={{ false: '#C8D0CC', true: colors.emerald }}/></View>)}
    <View style={s.row}><View style={{ flex: 1 }}><Text style={s.title}>Swipe gestures</Text><Text style={s.sub}>Enable navigation and input-language swipes in their labeled areas. Buttons always work.</Text></View><Switch accessibilityLabel="Swipe gestures" disabled={!app.ready || !!app.storageError} value={app.prefs.gestures} onValueChange={value => app.setPrefs({ ...app.prefs, gestures: value })} trackColor={{ false: '#C8D0CC', true: colors.emerald }}/></View>
    <Text accessibilityRole="header" style={s.section}>Voice</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Speech setup" onPress={() => router.push('/speech-setup')} style={s.row}>
      <View style={s.passportIcon}><Ionicons name="mic-outline" size={25} color={colors.primaryDark} accessible={false}/></View><View style={{ flex: 1 }}><Text style={s.title}>Speech setup</Text><Text style={s.sub}>Set up live captions for this device</Text></View><Ionicons name="chevron-forward" size={19} color={colors.primaryDark} accessible={false}/>
    </Pressable>
    <View style={s.row}><View><Text style={s.title}>Preferred voice</Text><Text style={s.sub}>Pakistan English · Sana</Text></View></View>
    <View style={s.row}><View><Text style={s.title}>Voice speed</Text><Text style={s.sub}>Normal · 1.0×</Text></View></View>
    <Text accessibilityRole="header" style={s.section}>Language</Text>
    <Text style={s.helper}>Choose the app language, then Save. Your names, numbers and messages stay unchanged.</Text>
    {languageChoices.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={option} aria-checked={option === language} accessibilityState={{ checked: option === language, disabled: saving }} disabled={saving} onPress={() => { setLanguage(option); setNotice(''); }} style={[s.row, option === language && s.passport]}><View style={{ flex: 1 }}><Text verbatim style={s.title}>{option}</Text></View><Ionicons name={option === language ? 'radio-button-on' : 'radio-button-off'} size={24} color={colors.primaryDark}/></Pressable>)}
    <Button label={saving ? 'Saving…' : 'Save language'} onPress={saveLanguage} disabled={saving || !app.ready || !!app.storageError || language === app.language}/>
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setLanguage(app.language); setNotice(''); }} style={s.retry}><Text style={s.link}>Cancel</Text></Pressable>
    {notice ? <Text accessibilityLiveRegion="polite" style={s.helper}>{notice}</Text> : null}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: colors.primaryDark, marginTop: 8, marginBottom: 10, textTransform: 'uppercase' },
  row: { minHeight: 78, padding: 16, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink }, sub: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 },
  passport: { borderWidth: 1, borderColor: '#DAD1FA', backgroundColor: '#F5F1FF' }, passportIcon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  helper: { fontSize: 12, lineHeight: 18, color: '#625D71', marginBottom: 22, paddingHorizontal: 4 }, error: { color: '#A7263B', fontSize: 13, lineHeight: 20 }, retry: { minHeight: 44, justifyContent: 'center' }, link: { color: colors.primaryDark, fontWeight: '700' },
});
