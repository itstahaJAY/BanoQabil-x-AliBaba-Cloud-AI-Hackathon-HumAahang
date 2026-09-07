import { Pressable, Text, Ionicons, useLocale } from './localized-ui';

import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { colors, radius, shadow, shadowStrong } from './theme';

const APressable = Animated.createAnimatedComponent(Pressable);

export function PressScale({ children, onPress, style, label, disabled }: { disabled?: boolean; children: React.ReactNode; onPress(): void; style?: StyleProp<ViewStyle>; label: string }) {
  const scale = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <APressable disabled={disabled} accessibilityState={{ disabled }} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={() => { scale.value = withSpring(.975, { damping: 18, stiffness: 280 }); }} onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 220 }); }} style={[style, motion]}>{children}</APressable>;
}

export function Orb({ state = 'idle', size = 74 }: { state?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'success'; size?: number }) {
  const { t } = useLocale();
  const pulse = useSharedValue(1), rotate = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) { pulse.value = 1; rotate.value = 0; return; }
    pulse.value = withRepeat(withSequence(withTiming(state === 'idle' ? 1.045 : 1.12, { duration: state === 'idle' ? 1700 : 520, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: state === 'idle' ? 1700 : 520 })), -1, true);
    rotate.value = state === 'thinking' ? withRepeat(withTiming(360, { duration: 2600, easing: Easing.linear }), -1) : withTiming(0);
  }, [state, reduceMotion]);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }, { rotate: `${rotate.value}deg` }] }));
  return <View style={[s.orbShadow, { width: size + 28, height: size + 28, borderRadius: size }]}><View style={[s.orbRing, { width: size + 14, height: size + 14, borderRadius: size }]}><Animated.View accessibilityLabel={t('Hum Ahang') + ' · ' + t(state)} style={[{ width: size, height: size, borderRadius: size / 2 }, motion]}><LinearGradient colors={['#927BFA', colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.orb, { borderRadius: size / 2 }]}><View style={s.orbGlint} /><View style={s.wave}>{[16, 29, 21, 35, 17].map((h, i) => <View key={i} style={[s.bar, { height: h * size / 74 }]} />)}</View></LinearGradient></Animated.View></View></View>;
}

export function Button({ label, onPress, icon = 'arrow-forward', variant = 'primary', style, disabled }: { disabled?: boolean; label: string; onPress(): void; icon?: any; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; style?: ViewStyle }) {
  const dark = variant === 'primary' || variant === 'danger';
  return <PressScale disabled={disabled} label={label} onPress={onPress} style={[s.button, s[variant], style, disabled && { opacity: .45 }]}><Ionicons name={icon} size={21} color={dark ? colors.surface : colors.emerald} /><Text style={[s.buttonText, !dark && { color: colors.ink }]}>{label}</Text></PressScale>;
}

export function Header({ title, subtitle, back, onBack, backLabel = 'Go back' }: { title: string; subtitle?: string; back?: boolean; onBack?: () => void; backLabel?: string }) {
  return <Animated.View entering={FadeInDown.duration(440)} style={s.header}>{back && <PressScale label={backLabel} onPress={onBack!} style={s.iconButton}><Ionicons name="arrow-back" size={22} color={colors.ink} /></PressScale>}<View style={{ flex: 1 }}><Text style={s.eyebrow}>HUM AHANG</Text><Text style={s.title}>{title}</Text>{subtitle && <Text style={s.subtitle}>{subtitle}</Text>}</View></Animated.View>;
}

export function FeatureCard({ title, subtitle, icon, onPress, tint = colors.mint, index = 0 }: { title: string; subtitle: string; icon: any; onPress(): void; tint?: string; index?: number }) {
  const { t } = useLocale();
  return <Animated.View entering={FadeInDown.delay(80 + index * 55).duration(420)}><PressScale label={`${t(title)}. ${t(subtitle)}`} onPress={onPress} style={s.card}><View style={[s.iconDepth, { backgroundColor: tint }]}><View style={s.iconGloss} /><Ionicons name={icon} size={25} color={colors.emeraldDark} /></View><View style={{ flex: 1 }}><Text style={s.cardTitle}>{title}</Text><Text style={s.cardText}>{subtitle}</Text></View><View style={s.arrow}><Ionicons name="arrow-up" size={18} color={colors.emerald} style={{ transform: [{ rotate: '45deg' }] }} /></View></PressScale></Animated.View>;
}

const s = StyleSheet.create({
  orbShadow: { backgroundColor: '#7657F622', alignItems: 'center', justifyContent: 'center', ...shadowStrong },
  orbRing: { backgroundColor: '#EEE9FFCC', borderWidth: 1, borderColor: '#FFFFFF99', alignItems: 'center', justifyContent: 'center' },
  orb: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF40' },
  orbGlint: { position: 'absolute', width: '66%', height: '40%', top: 4, left: 8, borderRadius: 99, backgroundColor: '#FFFFFF17', transform: [{ rotate: '-14deg' }] },
  wave: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 4 }, bar: { width: 4, borderRadius: 4, backgroundColor: colors.surface },
  button: { minHeight: 58, borderRadius: 20, paddingHorizontal: 20, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.primary, ...shadow }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, danger: { backgroundColor: colors.red }, ghost: { backgroundColor: 'transparent' }, buttonText: { flexShrink: 1, textAlign: 'center', paddingVertical: 8, fontSize: 15, fontWeight: '800', color: colors.surface, letterSpacing: -.15 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, marginBottom: 24 }, iconButton: { width: 48, height: 48, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: colors.primary, marginBottom: 5 }, title: { fontSize: 27, lineHeight: 33, fontWeight: '800', color: colors.ink, letterSpacing: -.7 }, subtitle: { fontSize: 14, lineHeight: 21, color: colors.muted, marginTop: 6, maxWidth: 330 },
  card: { minHeight: 82, borderRadius: radius.lg, padding: 12, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  iconDepth: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, iconGloss: { position: 'absolute', width: 45, height: 20, top: -4, left: -2, borderRadius: 30, backgroundColor: '#FFFFFF45', transform: [{ rotate: '-12deg' }] },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, letterSpacing: -.15 }, cardText: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3 }, arrow: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
});
export const ui = s;
