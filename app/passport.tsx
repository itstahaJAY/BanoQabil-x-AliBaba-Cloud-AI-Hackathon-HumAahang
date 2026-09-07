import { Pressable, Text, SafeAreaView, useLocale } from '../src/localized-ui';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Button, Header } from '../src/components';
import { router } from '../src/navigation';
import { PassportCard } from '../src/passport-card';
import { getContactQrCopy } from '../src/contact-qr-copy';
import { EmergencyButton } from '../src/emergency-ui';
import { passportShareText } from '../src/profile-data';
import { useApp } from '../src/store';
import { colors, radius, space } from '../src/theme';
import { personas } from '../src/types';

export default function Passport() {
  const app = useApp();
  const { t } = useLocale();
  const [preview, setPreview] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');
  const text = passportShareText(app, personas[app.persona].title);
  const share = async () => {
    if (sharing) return;
    setSharing(true); setMessage('');
    try {
      const result = await Share.share({ title: t('Hum Ahang · Communication passport'), message: text });
      // Android cannot confirm recipient delivery; web may resolve without an action object.
      setMessage(result?.action === Share.dismissedAction ? 'Sharing cancelled.' : 'Share dialog closed. Hum Ahang cannot confirm delivery.');
    } catch (error) {
      setMessage(error instanceof Error && error.name === 'AbortError' ? 'Sharing cancelled.' : 'Sharing is unavailable or was interrupted. You can select and copy the preview text below.');
    } finally { setSharing(false); }
  };
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Header back onBack={() => router.canGoBack() ? router.back() : router.replace('/profile')} title="Accessibility Passport" subtitle="Show this card to help someone communicate with you."/>
    {!app.ready ? <ActivityIndicator accessibilityLabel={t('Loading passport')} color={colors.primary}/> : app.storageError ?
      <View style={s.notice}><Text accessibilityRole="alert" style={s.error}>{app.storageError}</Text><Button label="Retry loading profile" onPress={app.reloadProfile}/></View> :
      <>
        <PassportCard value={app}/>
        <Text style={s.hint}>Manage your details in Profile → Settings → Passport details. This page is display-only.</Text>
        <EmergencyButton label={getContactQrCopy(app.language).entry} secondary onPress={() => router.push('/contact-qr')}/>
        <Button label={preview ? 'Hide share preview' : 'Preview & share passport'} icon="share-outline" onPress={() => { setPreview(!preview); setMessage(''); }}/>
        {preview ? <View style={s.preview}>
          <Text accessibilityRole="header" style={s.previewTitle}>Review before sharing</Text>
          <Text style={s.hint}>Only the text below will be shared. Anyone receiving a copy can keep or forward it.</Text>
          <Text verbatim selectable style={s.shareText}>{text}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Open device share options" accessibilityState={{ disabled: sharing }} disabled={sharing} onPress={share} style={[s.shareButton, sharing && { opacity: .55 }]}><Text style={s.shareLabel}>{sharing ? 'Opening share options…' : 'Open device share options'}</Text></Pressable>
          {message ? <Text accessibilityLiveRegion="polite" style={s.hint}>{message}</Text> : null}
        </View> : null}
        <View style={s.notice}><Text style={s.hint}>Stored on this device, not encrypted by this app. Contact details stay hidden on this card unless enabled in Settings. The separate contact QR requires your consent to reveal the number. Full-passport QR/link sharing is not available yet.</Text></View>
      </>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: 40, gap: 16 },
  hint: { fontSize: 12, lineHeight: 19, color: '#625D71' }, notice: { gap: 12, padding: 16, backgroundColor: '#F1EEF7', borderRadius: radius.md }, error: { color: '#A7263B', fontSize: 13, lineHeight: 20 },
  preview: { padding: 18, borderWidth: 1, borderColor: '#DBD4ED', borderRadius: radius.lg, backgroundColor: colors.surface, gap: 14 }, previewTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  shareText: { fontSize: 15, lineHeight: 24, color: colors.ink, padding: 14, backgroundColor: colors.cream, borderRadius: radius.sm, writingDirection: 'auto' },
  shareButton: { minHeight: 52, justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.primaryDark }, shareLabel: { fontWeight: '700', fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.surface },
});
