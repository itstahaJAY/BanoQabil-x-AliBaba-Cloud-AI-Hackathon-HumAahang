import { Text, TextInput, SafeAreaView } from '../src/localized-ui';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Header } from '../src/components';
import { getEmergencyCopy } from '../src/emergency-copy';
import { EmergencyButton } from '../src/emergency-ui';
import { router } from '../src/navigation';
import { validateEmergencyNumbers, type EmergencyNumbers } from '../src/profile-data';
import { useApp } from '../src/store';
import { colors, radius, space } from '../src/theme';

const leave = () => router.dismissTo('/settings');
export default function EmergencySettings() {
  const app = useApp(), copy = getEmergencyCopy(app.language);
  const rtl = app.language === 'اردو';
  return <SafeAreaView {...(Platform.OS === 'web' ? { dir: rtl ? 'rtl' : 'ltr', lang: rtl ? 'ur' : 'en' } : {})} style={[s.safe, Platform.OS !== 'web' && { direction: rtl ? 'rtl' : 'ltr' }]}>{!app.ready ? <View style={s.loading}><ActivityIndicator color={colors.primary}/><Text>{copy.loading}</Text></View> : app.storageError ?
    <View style={s.content}><Header title={copy.settingsTitle} backLabel={copy.back} back onBack={leave}/><Text accessibilityRole="alert" style={s.error}>{copy.loadError}</Text><EmergencyButton label={copy.reload} onPress={app.reloadProfile}/></View> :
    <NumbersForm initial={app.emergency} language={app.language} save={app.saveEmergency}/>}</SafeAreaView>;
}
function NumbersForm({ initial, language, save }: { initial: EmergencyNumbers; language: string; save(value: EmergencyNumbers): Promise<void> }) {
  const copy = getEmergencyCopy(language);
  const [draft, setDraft] = useState(() => ({ ...initial })), [baseline, setBaseline] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof EmergencyNumbers, string>>>({}), [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const lock = useRef(false), inputs = useRef<Partial<Record<keyof EmergencyNumbers, TextInput>>>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const submit = async () => {
    if (lock.current) return;
    const issues = validateEmergencyNumbers(draft); setErrors(issues);
    if (Object.keys(issues).length) { setMessage(copy.checkFields); inputs.current[Object.keys(issues)[0] as keyof EmergencyNumbers]?.focus(); return; }
    lock.current = true; setSaving(true); setMessage(''); setSaved(false);
    const value = { area: draft.area.trim(), medicalPhone: draft.medicalPhone.trim(), policePhone: draft.policePhone.trim() };
    try { await save(value); setDraft(value); setBaseline(value); setSaved(true); setMessage(copy.saved); }
    catch { setMessage(copy.saveError); }
    finally { lock.current = false; setSaving(false); }
  };
  return <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Header title={copy.settingsTitle} subtitle={copy.settingsSubtitle} backLabel={copy.back} back onBack={() => { if (!lock.current) leave(); }}/>
    <Text style={s.notice}>{copy.settingsIntro}</Text>
    <View style={s.panel}>{(['area', 'medicalPhone', 'policePhone'] as const).map(key => <View key={key} style={s.field}>
      <Text style={s.label}>{key === 'area' ? copy.areaLabel : key === 'medicalPhone' ? copy.medicalLabel : copy.policeLabel}</Text>
      <TextInput ref={node => { if (node) inputs.current[key] = node; }} accessibilityLabel={key === 'area' ? copy.areaLabel : key === 'medicalPhone' ? copy.medicalLabel : copy.policeLabel}
        aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} value={draft[key]} editable={!saving} maxLength={key === 'area' ? 80 : 30} keyboardType={key === 'area' ? 'default' : 'phone-pad'}
        onChangeText={value => { setDraft(previous => ({ ...previous, [key]: value })); setSaved(false); setMessage(''); setErrors({}); }} style={[s.input, key !== 'area' && { textAlign: 'left', writingDirection: 'ltr' }, !!errors[key] && s.invalid]}/>
      {errors[key] ? <Text nativeID={`${key}-error`} style={s.error}>{key === 'area' ? copy.areaError : copy.phoneError}</Text> : null}
    </View>)}<Text style={s.hint}>{copy.phoneHint}</Text></View>
    <Text style={s.hint}>{copy.settingsPrivacy}</Text>
    {message ? <Text accessibilityLiveRegion="polite" accessibilityRole={saved ? 'text' : 'alert'} style={[s.feedback, saved ? s.success : s.error]}>{message}</Text> : null}
    <EmergencyButton label={saving ? copy.saving : copy.save} onPress={submit} disabled={saving || !dirty}/>
    {saved ? <EmergencyButton label={copy.viewEmergency} secondary onPress={() => router.dismissTo('/emergency')}/> : null}
    <EmergencyButton label={copy.cancelSettings} secondary disabled={saving} onPress={leave}/>
  </ScrollView></KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, content: { padding: space.lg, paddingBottom: 40, gap: 16 },
  notice: { padding: 16, borderRadius: radius.md, backgroundColor: '#F3EEFD', color: '#514466', fontSize: 13, lineHeight: 23, writingDirection: 'auto' }, panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: '#E3DEED', gap: 20 }, field: { gap: 8 }, label: { color: colors.ink, fontWeight: '600', fontSize: 15, lineHeight: 24, writingDirection: 'auto' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#C9C1D7', borderRadius: radius.sm, padding: 12, backgroundColor: colors.cream, fontSize: 17, lineHeight: 25, color: colors.ink, writingDirection: 'auto' }, invalid: { borderWidth: 2, borderColor: '#A82A40' }, hint: { fontSize: 12, lineHeight: 21, color: '#655B74', writingDirection: 'auto' }, error: { fontSize: 13, lineHeight: 23, color: '#A1263B', writingDirection: 'auto' }, feedback: { padding: 14, backgroundColor: '#F4F0F9', borderRadius: radius.sm }, success: { color: '#216047', backgroundColor: colors.pastelGreen, fontSize: 13, lineHeight: 23, writingDirection: 'auto' },
});
