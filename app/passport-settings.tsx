import { Pressable, Switch, Text, TextInput, SafeAreaView, Ionicons, useLocale } from '../src/localized-ui';

import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Header } from '../src/components';
import { router } from '../src/navigation';
import { communicationInstructions, normalizePassportSettings, passportLanguages, validatePassportSettings, type PassportDetails, type PassportErrors, type PassportSettings } from '../src/profile-data';
import { useApp } from '../src/store';
import { colors, radius, space } from '../src/theme';
import { personas, type Persona } from '../src/types';

// Return to the owning menu even after a browser reload/deep link loses the prior stack.
const leave = () => router.dismissTo('/settings');

export default function PassportSettingsScreen() {
  const app = useApp();
  return <SafeAreaView style={s.safe}>
    {!app.ready ? <View style={s.loading}><ActivityIndicator color={colors.primary}/><Text>Loading saved details…</Text></View> : app.storageError ?
      <View style={s.content}><Header title="Passport details" back onBack={leave}/><Text accessibilityRole="alert" style={s.error}>{app.storageError}</Text><Action label="Retry loading profile" onPress={app.reloadProfile}/></View> :
      <PassportEditor initial={{ passport: app.passport, persona: app.persona, language: app.language }} save={app.savePassport}/>}
  </SafeAreaView>;
}

function PassportEditor({ initial, save }: { initial: PassportSettings; save(value: PassportSettings): Promise<void> }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<PassportSettings>(() => ({ ...initial, passport: { ...initial.passport } }));
  const [baseline, setBaseline] = useState(initial);
  const [errors, setErrors] = useState<PassportErrors>({});
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const inputs = useRef<Partial<Record<keyof PassportDetails, TextInput>>>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const change = (patch: Partial<PassportSettings>) => { setDraft(previous => ({ ...previous, ...patch })); setSaved(false); setMessage(''); setErrors({}); };
  const field = <K extends keyof PassportDetails>(key: K, value: PassportDetails[K]) => change({ passport: { ...draft.passport, [key]: value } });
  const submit = async () => {
    if (inFlight.current) return;
    const issues = validatePassportSettings(draft);
    setErrors(issues);
    if (Object.keys(issues).length) {
      setMessage('Check the highlighted field. Nothing has been saved.');
      const first = Object.keys(issues)[0] as keyof PassportDetails;
      inputs.current[first]?.focus();
      return;
    }
    inFlight.current = true; setSaving(true); setMessage(''); setSaved(false);
    try {
      const value = normalizePassportSettings(draft);
      await save(value);
      setDraft(value); setBaseline(value); setSaved(true); setMessage('Passport details saved on this device.');
    } catch { setMessage('Could not save your passport. Your edits are still here; please try again.'); }
    finally { inFlight.current = false; setSaving(false); }
  };
  const input = (key: 'name' | 'instructions' | 'contactName' | 'contactPhone', label: string, hint: string, maxLength: number) => <View style={s.field}>
    <Text nativeID={`${key}-label`} style={s.label}>{label}</Text>
    <TextInput ref={node => { if (node) inputs.current[key] = node; }} accessibilityLabel={label} aria-describedby={`${key}-hint${errors[key] ? ` ${key}-error` : ''}`} aria-invalid={!!errors[key]}
      value={draft.passport[key]} onChangeText={value => field(key, value)} editable={!saving} maxLength={maxLength}
      multiline={key === 'instructions'} keyboardType={key === 'contactPhone' ? 'phone-pad' : 'default'} autoComplete={key === 'name' ? 'name' : 'off'}
      textAlignVertical={key === 'instructions' ? 'top' : 'center'} style={[s.input, key === 'contactPhone' && { writingDirection: 'ltr', textAlign: 'left' }, key === 'instructions' && s.multiline, !!errors[key] && s.invalid]}/>
    <Text nativeID={`${key}-hint`} style={s.hint}>{hint}</Text>
    {errors[key] ? <Text nativeID={`${key}-error`} style={s.error}>{errors[key]}</Text> : null}
  </View>;
  return <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Header title="Passport details" subtitle="Your details. Your choice of what to show." back onBack={() => { if (!inFlight.current) leave(); }}/>
      <View style={s.notice}><Ionicons name="lock-closed-outline" size={20} color={colors.primaryDark}/><Text style={s.noticeText}>Edit here in Settings. Passport is a read-only card. Changes apply only when you save; Back or Cancel discards unsaved edits.</Text></View>
      <Section number="01" title="About you">
        {input('name', 'Display name (optional)', 'Up to 80 characters. Your name on Profile and Home.', 80)}
        <Text style={s.label}>Communication profile</Text>
        <Text style={s.hint}>Also updates your app communication preference.</Text>
        {(Object.keys(personas) as Persona[]).map(key => <Pressable key={key} accessibilityRole="button" aria-pressed={draft.persona === key} accessibilityState={{ selected: draft.persona === key, disabled: saving }} accessibilityLabel={personas[key].title} disabled={saving}
          onPress={() => change({ persona: key })} style={[s.choice, draft.persona === key && s.selected]}>
          <Ionicons name={personas[key].icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.primaryDark}/><Text style={s.choiceText}>{personas[key].title}</Text><Ionicons name={draft.persona === key ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primaryDark}/>
        </Pressable>)}
        <Text style={s.label}>Preferred language</Text>
        <View style={s.languages}>{passportLanguages.map(language => <Pressable key={language} accessibilityRole="button" aria-pressed={draft.language === language} accessibilityState={{ selected: draft.language === language, disabled: saving }} accessibilityLabel={language} disabled={saving}
          onPress={() => change({ language })} style={[s.language, draft.language === language && s.selected]}><Text verbatim style={s.choiceText}>{language}</Text>{draft.language === language ? <Ionicons name="checkmark" size={16} color={colors.primaryDark}/> : null}</Pressable>)}</View>
        <Text style={s.hint}>Changes the app language when you save. Your own text stays unchanged.</Text>
      </Section>
      <Section number="02" title="Communication instructions">
        {input('instructions', 'Custom instructions (optional)', t('{count}/600 characters. Leave empty to use the profile suggestion below.', { count: draft.passport.instructions.length }), 600)}
        <View style={s.suggestion}><Text style={s.suggestionLabel}>PROFILE SUGGESTION</Text><Text style={s.suggestionText}>{communicationInstructions[draft.persona]}</Text></View>
      </Section>
      <Section number="03" title="Emergency contact">
        <Text style={s.hint}>Optional. Add someone who has agreed to be your contact. Saving does not call or notify anyone.</Text>
        {input('contactName', 'Contact name (optional)', 'For example, the name of a family member or carer.', 80)}
        {input('contactPhone', 'Contact phone number', 'Include a country code for international use. No number is dialled here.', 30)}
      </Section>
      <Section number="04" title="Shown on your passport">
        <Text style={s.hint}>These choices apply to both the displayed card and shared text. Your profile, language and instructions are always included.</Text>
        <Toggle label="Show my name" detail="Hide your name on the card without deleting it." value={draft.passport.showName} disabled={saving} onChange={value => field('showName', value)}/>
        <Toggle label="Show emergency contact" detail="Off by default. Enable only if you want others to see this number." value={draft.passport.showContact} disabled={saving} onChange={value => field('showContact', value)}/>
      </Section>
      <Text style={s.hint}>Stored locally, not encrypted by this app, and not synced to other devices. Shared copies cannot be recalled. Avoid adding sensitive medical or identity information.</Text>
      {message ? <Text accessibilityRole={saved ? 'text' : 'alert'} accessibilityLiveRegion="polite" style={[s.feedback, saved ? s.success : s.error]}>{message}</Text> : null}
      <Action label={saving ? 'Saving…' : 'Save passport details'} onPress={submit} disabled={saving || !dirty}/>
      {saved ? <Action label="View passport" onPress={() => router.push('/passport')} secondary/> : null}
      <Action label="Cancel and return to Settings" onPress={leave} disabled={saving} secondary/>
    </ScrollView>
  </KeyboardAvoidingView>;
}
function Section({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <View style={s.section}><View style={s.sectionHeading}><Text style={s.number}>{number}</Text><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text></View>{children}</View>;
}
function Toggle({ label, detail, value, disabled, onChange }: { label: string; detail: string; value: boolean; disabled: boolean; onChange(value: boolean): void }) {
  return <View style={s.toggle}><View style={{ flex: 1 }}><Text style={s.label}>{label}</Text><Text style={s.hint}>{detail}</Text></View><Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: '#C8C4D6', true: colors.primaryDark }}/></View>;
}
function Action({ label, onPress, disabled = false, secondary = false }: { label: string; onPress(): void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.action, secondary && s.secondary, (disabled || pressed) && { opacity: .55 }]}><Text style={[s.actionText, secondary && { color: colors.primaryDark }]}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  content: { padding: space.lg, paddingBottom: 40, gap: 14 }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.pastelPurple, padding: 16, borderRadius: radius.md }, noticeText: { flex: 1, color: '#49405F', fontSize: 12, lineHeight: 19 },
  section: { padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.surface, gap: 14 }, sectionHeading: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 2 }, number: { fontSize: 11, fontWeight: '700', color: colors.primaryDark, backgroundColor: colors.pastelPurple, padding: 8, borderRadius: 10 }, sectionTitle: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.ink },
  field: { gap: 7 }, label: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.ink }, hint: { fontSize: 12, lineHeight: 18, color: '#625D71' }, input: { minHeight: 50, borderWidth: 1, borderColor: '#C9C4D6', borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, lineHeight: 24, backgroundColor: colors.cream, color: colors.ink, writingDirection: 'auto' }, multiline: { minHeight: 128 }, invalid: { borderColor: '#B52F43', borderWidth: 2 }, error: { fontSize: 13, lineHeight: 20, color: '#A7263B' },
  choice: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: '#DDD9E7', borderRadius: radius.sm }, selected: { borderColor: colors.primaryDark, backgroundColor: '#F4F0FF' }, choiceText: { flexShrink: 1, fontSize: 13, lineHeight: 20, color: colors.ink }, languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, language: { minHeight: 46, borderWidth: 1, borderColor: '#DDD9E7', paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', gap: 5 },
  suggestion: { padding: 14, borderLeftWidth: 3, borderLeftColor: '#9D87E9', backgroundColor: colors.cream, gap: 7 }, suggestionLabel: { fontSize: 10, letterSpacing: .8, fontWeight: '700', color: colors.primaryDark }, suggestionText: { fontSize: 13, lineHeight: 20, color: '#49405F' }, toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  action: { minHeight: 52, padding: 14, borderRadius: radius.md, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' }, actionText: { fontSize: 15, lineHeight: 22, textAlign: 'center', fontWeight: '700', color: colors.surface }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#DDD9E7' }, feedback: { padding: 14, borderRadius: radius.sm, backgroundColor: '#F5F1FA' }, success: { color: '#206448', backgroundColor: colors.pastelGreen, fontSize: 13, lineHeight: 20 },
});
