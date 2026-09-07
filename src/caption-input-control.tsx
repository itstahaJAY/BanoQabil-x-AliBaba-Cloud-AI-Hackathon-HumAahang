import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { Pressable, Text, Ionicons, useLocale } from './localized-ui';
import { GestureSurface } from './gesture-surface';
import { createInputLanguageFeedback, type LanguageFeedbackState } from './input-language-feedback';
import { colors, radius } from './theme';

type Language = 'en' | 'ur';
export function CaptionInputControl({ value, disabled, gesturesEnabled, onSelect, onFeedbackBusy }: {
  value: Language; disabled: boolean; gesturesEnabled: boolean;
  onSelect(language: Language): boolean; onFeedbackBusy(busy: boolean): void;
}) {
  const { t } = useLocale();
  const [reader, setReader] = useState(false);
  const [feedback, setFeedback] = useState<LanguageFeedbackState>({ busy: false, error: false });
  const mounted = useRef(false);
  const player = useRef<ReturnType<typeof createInputLanguageFeedback> | null>(null);
  const choices = useRef<Array<React.ComponentRef<typeof Pressable> | null>>([]);
  const getPlayer = useCallback(() => {
    if (!player.current) player.current = createInputLanguageFeedback(Speech, next => {
      if (mounted.current) { setFeedback(next); onFeedbackBusy(next.busy); }
    });
    return player.current;
  }, [onFeedbackBusy]);
  useEffect(() => {
    mounted.current = true;
    // RN Web reports true unconditionally; it cannot detect browser screen readers.
    let readerChanged = false;
    if (Platform.OS !== 'web') void AccessibilityInfo.isScreenReaderEnabled().then(enabled => { if (mounted.current && !readerChanged) setReader(enabled); }).catch(() => {});
    const readerChange = Platform.OS !== 'web' ? AccessibilityInfo.addEventListener('screenReaderChanged', enabled => { readerChanged = true; setReader(enabled); }) : null;
    const stop = () => player.current?.stop();
    const appChange = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    const hidden = () => { if (document.visibilityState !== 'visible') stop(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', hidden);
    return () => {
      mounted.current = false; readerChange?.remove(); appChange.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', hidden);
      player.current?.dispose(); player.current = null;
    };
  }, []);
  useFocusEffect(useCallback(() => () => { player.current?.stop(); }, []));
  useEffect(() => { if (disabled || reader) player.current?.stop(); }, [disabled, reader]);
  const select = (language: Language) => {
    if (disabled || !onSelect(language)) return;
    const message = language === 'ur' ? 'Urdu input selected.' : 'English input selected.';
    if (reader) { getPlayer().stop(); AccessibilityInfo.announceForAccessibility(t(message)); }
    else getPlayer().speak(language);
  };
  return <View style={s.panel}>
    <View style={s.heading}><Ionicons name="language-outline" size={20} color={colors.primaryDark} accessible={false}/><Text style={s.title}>Speaking language</Text></View>
    <View style={s.choices} {...(Platform.OS === 'web' ? { dir: 'ltr' as const } : {})} accessibilityRole="radiogroup" accessibilityLabel={t('Speaking language')}>
      {(['en', 'ur'] as const).map((language, index) => <Pressable key={language} ref={element => { choices.current[index] = element; }} accessibilityRole="radio" accessibilityLabel={language === 'en' ? 'English input' : 'Urdu input'} accessibilityState={{ checked: value === language, disabled }} {...(Platform.OS === 'web' ? { 'aria-checked': value === language, tabIndex: value === language ? 0 : -1, onKeyDown: (event: { key: string; preventDefault(): void }) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || disabled) return;
        event.preventDefault(); const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 0 : 1;
        select(next === 0 ? 'en' : 'ur'); choices.current[next]?.focus();
      } } : {})} disabled={disabled} onPress={() => select(language)} style={[s.choice, value === language && s.selected, disabled && s.dim]}>
        <Text verbatim style={[s.choiceText, value === language && s.selectedText]}>{language === 'en' ? 'English' : 'اردو'}</Text>
        {value === language && <Ionicons name="checkmark-circle" size={16} color={colors.primaryDark} accessible={false}/>}
      </Pressable>)}
    </View>
    <GestureSurface axis="horizontal" enabled={gesturesEnabled && !disabled} accessibilityLabel={t('Input language swipe area')} onSwipe={direction => { if (direction === 'left') select('en'); if (direction === 'right') select('ur'); }} style={s.swipe}>
      {disabled || !gesturesEnabled ? <Text style={s.swipeText}>{disabled ? 'Stop to change language.' : 'Gestures are off. Tap a language above.'}</Text> : <View style={s.swipeRow} {...(Platform.OS === 'web' ? { dir: 'ltr' as const } : {})}>
        <Text verbatim style={s.swipeText}>← English</Text><Text style={s.swipeHint}>Swipe here</Text><Text verbatim style={s.swipeText}>اردو →</Text>
      </View>}
    </GestureSurface>
    {feedback.busy && <View style={s.feedback}><Text style={s.status}>Announcing selected language…</Text><Pressable accessibilityLabel="Stop voice indication" onPress={() => getPlayer().stop()} style={s.stop}><Ionicons name="stop-circle-outline" size={20} color={colors.primaryDark} accessible={false}/><Text style={s.stopText}>Stop voice</Text></Pressable></View>}
    {feedback.error && <Text accessibilityLiveRegion="polite" style={s.hint}>{feedback.busy ? 'Could not stop voice indication. Tap Stop voice again before recording.' : 'Language selected. Voice indication is unavailable; check device volume and voices.'}</Text>}
  </View>;
}
const s = StyleSheet.create({
  panel: { marginBottom: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, title: { fontSize: 14, fontWeight: '700', color: colors.ink },
  choices: { flexDirection: 'row', ...(Platform.OS !== 'web' ? { direction: 'ltr' as const } : {}), gap: 8 }, choice: { flex: 1, minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' },
  selected: { borderColor: colors.primaryDark, backgroundColor: colors.primaryLight }, choiceText: { color: colors.ink, fontSize: 16, lineHeight: 26 }, selectedText: { color: colors.primaryDark, fontWeight: '700' },
  swipe: { marginTop: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, justifyContent: 'center', backgroundColor: colors.primaryLight }, swipeRow: { flexDirection: 'row', ...(Platform.OS !== 'web' ? { direction: 'ltr' as const } : {}), alignItems: 'center', justifyContent: 'space-between', gap: 8 }, swipeText: { color: colors.primaryDark, fontSize: 12, lineHeight: 20, textAlign: 'center' }, swipeHint: { color: '#625D71', fontSize: 11, lineHeight: 20 },
  hint: { marginTop: 8, color: colors.muted, fontSize: 12, lineHeight: 19 }, status: { color: colors.primaryDark, fontSize: 12, lineHeight: 20, marginTop: 6 }, feedback: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  stop: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }, stopText: { color: colors.primaryDark, fontSize: 12 }, dim: { opacity: 0.55 },
});
