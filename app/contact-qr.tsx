import { Text, SafeAreaView } from '../src/localized-ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Header } from '../src/components';
import { contactQrValue, createContactQr, type ContactQr } from '../src/contact-qr';
import { getContactQrCopy } from '../src/contact-qr-copy';
import { EmergencyButton } from '../src/emergency-ui';
import { router } from '../src/navigation';
import { emergencyCallTarget } from '../src/profile-data';
import { useApp } from '../src/store';
import { colors, radius, space } from '../src/theme';

export default function ContactQrScreen() {
  const app = useApp(), copy = getContactQrCopy(app.language), rtl = app.language === 'اردو';
  const contact = app.ready && !app.storageError ? emergencyCallTarget('family', app) : null;
  const contactKey = contact ? JSON.stringify([contact.number, contact.name]) : '';
  const [approval, setApproval] = useState<{ key: string; code: ContactQr } | null>(null);
  const [error, setError] = useState(false);
  const visible = approval?.key === contactKey && contact !== null ? approval : null;
  const supported = contactQrValue(contact?.number || '', true) !== null;
  const hide = useCallback(() => { setApproval(null); setError(false); }, []);
  useEffect(hide, [contactKey, hide]);
  useFocusEffect(useCallback(() => hide, [hide]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') hide(); });
    return () => subscription.remove();
  }, [hide]);
  const reveal = () => {
    if (visible) { hide(); return; }
    if (!contact) return;
    try {
      const code = createContactQr(contact.number, true);
      if (!code) { setError(true); return; }
      setApproval({ key: contactKey, code }); setError(false);
    } catch { setApproval(null); setError(true); }
  };
  const leave = () => { hide(); router.canGoBack() ? router.back() : router.replace('/passport'); };
  return <SafeAreaView {...(Platform.OS === 'web' ? { dir: rtl ? 'rtl' : 'ltr', lang: rtl ? 'ur' : 'en', onKeyDown: (event: { key: string }) => { if (event.key === 'Escape') hide(); } } : {})}
    style={[s.safe, Platform.OS !== 'web' && { direction: rtl ? 'rtl' : 'ltr' }]}>
    <ScrollView contentContainerStyle={s.content}>
      <Header title={copy.title} subtitle={copy.subtitle} back backLabel={copy.back} onBack={leave}/>
      {!app.ready ? <View style={s.panel}><ActivityIndicator color={colors.primary}/><Text style={s.body}>{copy.loading}</Text></View> : app.storageError ?
        <View style={s.panel}><Text accessibilityRole="alert" style={s.body}>{copy.loadError}</Text><EmergencyButton label={copy.retry} onPress={app.reloadProfile}/></View> :
        <>
          <View style={s.notice}><Text style={s.body}>{copy.privacy}</Text></View>
          {!contact || !supported ? <View style={s.panel}>
            <Text style={s.body}>{contact ? copy.format : copy.missing}</Text>
            <EmergencyButton label={copy.settings} onPress={() => { hide(); router.push('/passport-settings'); }}/>
          </View> : <>
            <EmergencyButton label={visible ? copy.hide : copy.reveal} onPress={reveal}/>
            {error ? <Text accessibilityRole="alert" style={s.error}>{copy.generationError}</Text> : null}
            {visible ? <View style={s.panel}>
              <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.heading}>{copy.scan}</Text>
              <View {...(Platform.OS === 'web' ? { dir: 'ltr' } : {})} accessible accessibilityRole="image" accessibilityLabel={copy.qrLabel} style={[s.qr, Platform.OS !== 'web' && { direction: 'ltr' }, { width: visible.code.size * 6, height: visible.code.size * 6 }]}>
                {visible.code.bars.map((bar, i) => <View key={i} accessible={false} style={{ position: 'absolute', left: bar.x * 6, top: bar.y * 6, width: bar.width * 6, height: 6, backgroundColor: '#000000' }}/>) }
              </View>
              <Text verbatim selectable style={s.name}>{contact.name || copy.contact}</Text>
              <Text verbatim selectable style={s.number}>{contact.number}</Text>
              <Text style={s.body}>{copy.instructions}</Text>
              <Text style={s.hint}>{copy.fallback}</Text>
            </View> : null}
          </>}
          <Text style={s.hint}>{copy.boundary}</Text>
        </>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: 40, gap: 16 },
  panel: { padding: 16, gap: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  notice: { padding: 16, backgroundColor: '#F1EEF7', borderRadius: radius.md }, body: { fontSize: 14, lineHeight: 24, color: '#51485E', writingDirection: 'auto' },
  heading: { fontSize: 19, lineHeight: 29, fontWeight: '700', color: colors.ink, textAlign: 'center', writingDirection: 'auto' },
  qr: { alignSelf: 'center', backgroundColor: '#FFFFFF' }, name: { fontSize: 17, lineHeight: 27, fontWeight: '600', textAlign: 'center', color: colors.ink, writingDirection: 'auto' },
  number: { fontSize: 23, lineHeight: 32, fontWeight: '700', textAlign: 'center', writingDirection: 'ltr', color: colors.ink },
  hint: { fontSize: 12, lineHeight: 21, color: '#625D71', writingDirection: 'auto' }, error: { fontSize: 14, lineHeight: 24, color: '#A1263B', writingDirection: 'auto' },
});
