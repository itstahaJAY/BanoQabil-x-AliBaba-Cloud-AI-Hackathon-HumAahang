import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from './components';
import { Ionicons, Pressable, SafeAreaView, Text, useLocale } from './localized-ui';
import { router } from './navigation';
import { PhotoCapture, type CapturedPhoto } from './photo-capture';
import { RecordingStatus } from './recording-status';
import { useApp } from './store';
import { colors } from './theme';
import { usePhotoAnalysis } from './use-photo-analysis';
import type { VisionLanguage, VisionTask } from './vision-client';

const resultLanguages: { code: VisionLanguage; label: string; name: string }[] = [
  { code: 'en', label: 'English', name: 'English' },
  { code: 'ur', label: 'اردو', name: 'Urdu' },
  { code: 'roman', label: 'Roman Urdu', name: 'Roman Urdu' },
];

/** Screen owns the photo; the hook owns network and voice lifetimes. */
export function PhotoAssistScreen({ task }: { task: VisionTask }) {
  const { language, rtl, t } = useLocale();
  const { prefs } = useApp();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [readAloud, setReadAloud] = useState(prefs.autoSpeak);
  const analysis = usePhotoAnalysis();
  const scroll = useRef<ScrollView>(null);
  const isGesture = task === 'gesture', busy = analysis.phase === 'analyzing';
  const translating = analysis.phase === 'translating';
  const speaking = analysis.playback.phase !== 'idle';
  const outputLanguage: VisionLanguage = language === 'English' ? 'en' : rtl ? 'ur' : 'roman';
  const resultRTL = analysis.language === 'ur';
  const { cancel } = analysis;
  useFocusEffect(useCallback(() => () => setCameraOpen(false), []));
  useEffect(() => {
    // iOS permission prompts can be briefly inactive; only actual backgrounding closes capture.
    const subscription = AppState.addEventListener('change', status => { if (status === 'background') setCameraOpen(false); });
    const hidden = () => { if (document.visibilityState !== 'visible') setCameraOpen(false); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', hidden);
    return () => { subscription.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', hidden); };
  }, []);
  // Changing language invalidates pending results and stops the old language's voice.
  useEffect(() => { cancel(); }, [outputLanguage, cancel]);
  const startCamera = () => { cancel(); setPhoto(null); setCameraOpen(true); };
  const takePhoto = (captured: CapturedPhoto) => { setCameraOpen(false); setPhoto(captured); };
  const analyze = () => { if (photo) void analysis.analyze(photo, outputLanguage, task, readAloud); };
  const back = () => { setCameraOpen(false); cancel(); router.canGoBack() ? router.back() : router.replace('/'); };
  if (cameraOpen) return <SafeAreaView style={s.safe}><View style={s.camera}>
    <PhotoCapture onCapture={takePhoto} onCancel={() => setCameraOpen(false)} facing={isGesture ? 'front' : 'back'}/>
  </View></SafeAreaView>;
  return <SafeAreaView style={s.safe}>
    <View style={s.header}>
      <Pressable onPress={back} accessibilityLabel="Go back" style={s.iconButton}><Ionicons name="arrow-back" size={23} color={colors.ink}/></Pressable>
      <View style={s.headerCopy}><Text accessibilityRole="header" style={s.title}>{isGesture ? 'Sign Assistant' : 'AI Vision'}</Text>
        <Text style={s.subtitle}>{isGesture ? 'Simple hand gestures · experimental' : 'Take a photo. Hear what is visible.'}</Text></View>
    </View>
    <ScrollView ref={scroll} contentContainerStyle={s.content}>
      {isGesture && <View style={s.notice}><Text style={s.noticeText}>Hand-pose practice only. This is not Pakistani Sign Language translation and cannot understand moving signs or sentences.</Text></View>}
      <View style={[s.preview, photo && s.previewWithPhoto]}>
        {photo ? <Image source={{ uri: photo.uri }} resizeMode="contain" style={s.image} accessible accessibilityLabel={t('Your captured photo')}/> : <>
          <View style={s.cameraIcon}><Ionicons name={isGesture ? 'hand-left-outline' : 'camera-outline'} size={40} color={colors.primaryDark}/></View>
          <Text style={s.emptyTitle}>{isGesture ? 'Keep one hand clearly in view' : 'What is in front of you?'}</Text>
          <Text style={s.emptyText}>{isGesture ? 'Use good light and show your whole hand.' : 'Keep the photo clear and well lit.'}</Text>
        </>}
      </View>
      {!photo ? <Button label="Take a photo" icon="camera-outline" onPress={startCamera}/> : <>
        {busy ? <View style={s.progress} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primaryDark}/><Text style={s.progressText}>Analyzing your photo…</Text>
          <Pressable onPress={cancel} accessibilityLabel="Cancel photo analysis" style={s.smallButton}><Text style={s.link}>Cancel</Text></Pressable>
        </View> : analysis.result ? null : <Button label="Analyze photo" icon="scan-outline" onPress={analyze}/>}
        <View style={s.photoActions}>
          <Pressable onPress={startCamera} style={s.smallButton} accessibilityLabel="Retake photo"><Ionicons name="camera-reverse-outline" size={19} color={colors.primaryDark}/><Text style={s.link}>Retake photo</Text></Pressable>
          <Pressable onPress={() => { cancel(); setPhoto(null); }} style={s.smallButton} accessibilityLabel="Clear photo"><Ionicons name="close" size={19} color={colors.muted}/><Text style={s.secondaryLink}>Clear photo</Text></Pressable>
        </View>
      </>}
      {!analysis.result && <Pressable accessibilityRole="button" accessibilityLabel="Read results aloud" accessibilityState={{ selected: readAloud, disabled: busy }} disabled={busy} onPress={() => setReadAloud(value => !value)} style={s.readOption}>
        <Ionicons name={readAloud ? 'volume-high-outline' : 'volume-mute-outline'} size={22} color={colors.primaryDark}/><Text style={s.readText}>Read results aloud</Text>
        <View accessible={false} style={[s.switch, readAloud && s.switchOn]}><View style={[s.switchDot, readAloud && s.switchDotOn]}/></View>
      </Pressable>}
      {!!analysis.message && <View style={s.error} accessibilityLiveRegion="polite"><Text style={s.errorText}>{analysis.message}</Text>
        {analysis.needsConnection && <Button label="Open Speech setup" variant="secondary" icon="settings-outline" onPress={() => router.push('/speech-setup')}/>}
      </View>}
      {analysis.result && <View style={s.result} onLayout={({ nativeEvent }) => scroll.current?.scrollTo({ y: nativeEvent.layout.y, animated: false })}>
        <View style={s.resultHeading}><Ionicons name={analysis.result.uncertain ? 'help-circle-outline' : 'checkmark-circle-outline'} size={23} color={colors.primaryDark}/><Text accessibilityRole="header" style={s.resultTitle}>{analysis.result.uncertain ? 'Please check this result' : 'Photo result'}</Text></View>
        {!isGesture && <View style={s.languageControl}>
          <Text style={s.languageLabel}>Result language</Text>
          <View {...(Platform.OS === 'web' ? { dir: 'ltr' } : {})} style={[s.languages, Platform.OS !== 'web' && { direction: 'ltr' }]}>{resultLanguages.map(option => {
            const selected = analysis.language === option.code;
            return <Pressable key={option.code} accessibilityLabel={option.name}
              accessibilityState={{ selected, disabled: translating, busy: translating && analysis.translatingTo === option.code }}
              disabled={translating} onPress={() => { if (!selected) void analysis.translate(option.code, readAloud); }}
              style={[s.languageButton, selected && s.languageSelected]}>
              {selected && <Ionicons name="checkmark" size={15} color={colors.primaryDark}/>}
              <Text verbatim style={[s.languageText, option.code === 'ur' ? s.rtlText : s.ltrText]}>{option.label}</Text>
            </Pressable>;
          })}</View>
          {translating && <View style={s.progress} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primaryDark}/><Text style={s.progressText}>Translating result…</Text>
            <Pressable onPress={analysis.cancelTranslation} accessibilityLabel="Cancel translation" style={s.smallButton}><Text style={s.link}>Cancel</Text></Pressable>
          </View>}
        </View>}
        <Text verbatim selectable accessibilityLiveRegion={readAloud ? 'none' : 'polite'} style={[s.description, resultRTL ? s.urdu : s.ltrText]}>{analysis.result.description}</Text>
        {analysis.result.objects.length > 0 && <View {...(Platform.OS === 'web' ? { dir: resultRTL ? 'rtl' : 'ltr' } : {})} style={[s.objects, Platform.OS !== 'web' && { direction: resultRTL ? 'rtl' : 'ltr' }]}>{analysis.result.objects.map((object, index) => <View style={s.object} key={`${index}-${object}`}><Text verbatim style={[s.objectText, resultRTL ? s.rtlText : s.ltrText]}>{object}</Text></View>)}</View>}
        {speaking ? <RecordingStatus active={analysis.playback.phase === 'speaking'} title={analysis.playback.phase === 'preparing' ? 'Preparing voice' : 'Speaking'} detail="Device voice" action="stop" accessibilityLabel="Stop speaking" onAction={analysis.stopSpeaking}/> : !translating && <Button label="Speak again" icon="volume-high-outline" variant="secondary" onPress={analysis.speak}/>}
        {!!analysis.playback.error && <Text style={s.errorText} accessibilityLiveRegion="polite">{analysis.playback.error}</Text>}
        {!isGesture && <Text style={s.privacy}>Changing language sends only the result text to OpenAI, not your photo again.</Text>}
      </View>}
      {isGesture && <View style={s.supported}><Text style={s.resultTitle}>Supported hand poses</Text><Text style={s.emptyText}>Open palm, closed fist, thumbs-up, thumbs-down, victory, and pointing up. Other poses may be unknown.</Text></View>}
      <Text style={s.privacy}>Analyze sends this photo to OpenAI. Hum Ahang does not store the upload on its server. Camera photos may remain in temporary device cache.</Text>
      <View style={s.caution}><Ionicons name="information-circle-outline" size={18} color="#665025"/><Text style={s.cautionText}>AI can miss objects or make mistakes. Do not use this for road crossing, medical decisions, or confirming safety.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream }, camera: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 12 }, headerCopy: { flex: 1 },
  iconButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800' }, subtitle: { color: '#615E70', fontSize: 13, lineHeight: 20, marginTop: 3 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  preview: { minHeight: 220, borderWidth: 1, borderColor: '#E4DFF0', borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, overflow: 'hidden' },
  previewWithPhoto: { height: 240, padding: 0, backgroundColor: '#20202A' }, image: { width: '100%', height: '100%' },
  cameraIcon: { height: 76, width: 76, borderRadius: 24, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: '700', textAlign: 'center' }, emptyText: { color: '#615E70', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  photoActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  smallButton: { minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 1 },
  link: { fontSize: 14, color: colors.primaryDark, fontWeight: '700', flexShrink: 1 }, secondaryLink: { color: '#615E70', fontSize: 14, flexShrink: 1 },
  progress: { minHeight: 58, borderRadius: 18, backgroundColor: colors.primaryLight, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }, progressText: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600' },
  readOption: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 }, readText: { flex: 1, color: colors.ink, fontSize: 14 },
  switch: { width: 44, height: 26, borderRadius: 20, padding: 3, backgroundColor: '#A6A1B3' }, switchOn: { backgroundColor: colors.primaryDark },
  switchDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface, alignSelf: 'flex-start' }, switchDotOn: { alignSelf: 'flex-end' },
  error: { backgroundColor: colors.redSoft, borderRadius: 16, padding: 16, gap: 12 }, errorText: { color: '#842334', fontSize: 14, lineHeight: 22 },
  result: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E4DFF0', borderRadius: 20, padding: 16, gap: 16 }, resultHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultTitle: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: colors.ink }, description: { fontSize: 20, lineHeight: 30, color: colors.ink }, urdu: { writingDirection: 'rtl', textAlign: 'right', lineHeight: 34 },
  languageControl: { gap: 8 }, languageLabel: { fontSize: 12, fontWeight: '600', color: '#615E70' },
  languages: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: colors.cream, borderRadius: 14 },
  languageButton: { flex: 1, minHeight: 48, paddingHorizontal: 6, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: 'transparent', borderRadius: 10 },
  languageSelected: { backgroundColor: colors.primaryLight, borderColor: '#B5A1F4' }, languageText: { fontSize: 14, fontWeight: '600', color: colors.primaryDark, flexShrink: 1 },
  rtlText: { writingDirection: 'rtl', textAlign: 'right' }, ltrText: { writingDirection: 'ltr', textAlign: 'left' },
  objects: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, object: { backgroundColor: colors.primaryLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }, objectText: { fontSize: 14, color: colors.primaryDark },
  privacy: { fontSize: 12, lineHeight: 19, color: '#615E70' }, caution: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.yellow }, cautionText: { flex: 1, fontSize: 12, lineHeight: 19, color: '#665025' },
  notice: { padding: 14, borderRadius: 14, backgroundColor: colors.primaryLight }, noticeText: { color: '#493781', fontSize: 13, lineHeight: 21 }, supported: { gap: 8, padding: 16, alignItems: 'center' },
});
