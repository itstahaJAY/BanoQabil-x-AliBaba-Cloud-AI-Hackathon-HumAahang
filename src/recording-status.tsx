import { Pressable, Text, Ionicons, useLocale } from './localized-ui';

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { colors } from './theme';

type Props = { active?: boolean; title?: string; detail: string; detailVerbatim?: boolean; action: 'stop' | 'pause' | 'resume'; actionLabel?: string; accessibilityLabel?: string; disabled?: boolean; onAction(): void };

// Decorative activity only: this is not a microphone-level meter.
function WaveBar({ index, active }: { index: number; active: boolean }) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    cancelAnimation(scale);
    scale.value = 1;
    if (active && !reducedMotion) {
      scale.value = withRepeat(withSequence(
        withTiming(0.45, { duration: 480 + index * 90, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 560 + index * 60, easing: Easing.inOut(Easing.ease) }),
      ), -1);
    }
    return () => cancelAnimation(scale);
  }, [active, reducedMotion, index, scale]);
  const motion = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return <Animated.View style={[styles.bar, { height: [10, 19, 26, 17, 11][index], opacity: active ? 1 : 0.35 }, motion]} />;
}

export function RecordingStatus({ active = true, title, detail, detailVerbatim = false, action, onAction, actionLabel, accessibilityLabel, disabled }: Props) {
  const { t } = useLocale();
  const label = actionLabel || (action === 'stop' ? 'Stop' : action === 'pause' ? 'Pause' : 'Resume');
  return <View style={styles.card}>
    <View style={styles.wave} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3, 4].map(index => <WaveBar key={index} index={index} active={active} />)}
    </View>
    <View style={styles.copy} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{title || (active ? 'Listening' : 'Paused')}</Text>
      <Text verbatim={detailVerbatim} style={styles.detail}>{detail}</Text>
    </View>
    <Pressable onPress={onAction} disabled={disabled} accessibilityState={{ disabled }} accessibilityRole="button" accessibilityLabel={accessibilityLabel || t(label) + ' · ' + t('Listening')}
      style={({ pressed }) => [styles.action, action === 'stop' && styles.stop, (pressed || disabled) && styles.pressed]}>
      <Ionicons name={action === 'resume' ? 'play' : action} size={16} color={action === 'stop' ? '#AE3546' : colors.primaryDark} />
      <Text style={[styles.actionText, action === 'stop' && { color: '#AE3546' }]}>{label}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E8E3F3', borderRadius: 20 },
  wave: { width: 46, height: 48, borderRadius: 14, backgroundColor: '#F3F0FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  bar: { width: 3, borderRadius: 3, backgroundColor: colors.primary },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: colors.ink },
  detail: { fontSize: 12, lineHeight: 17, color: '#646172' },
  action: { maxWidth: '42%', flexShrink: 1, flexWrap: 'wrap', minHeight: 48, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#F3F0FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  stop: { backgroundColor: '#FFF0F2' },
  actionText: { flexShrink: 1, textAlign: 'center', fontSize: 13, fontWeight: '600', color: colors.primaryDark },
  pressed: { opacity: 0.7 },
});
