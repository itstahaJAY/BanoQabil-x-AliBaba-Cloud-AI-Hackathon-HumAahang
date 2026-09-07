import React, { forwardRef } from 'react';
import { Platform, StyleSheet, Text as NativeText, TextInput as NativeInput, Pressable as NativePressable, Switch as NativeSwitch, View, type TextProps, type TextInputProps, type PressableProps, type SwitchProps, type ViewProps } from 'react-native';
import { SafeAreaView as NativeSafeArea, type SafeAreaViewProps } from 'react-native-safe-area-context';
import { Ionicons as NativeIcons } from '@expo/vector-icons';
import { useApp } from './store';
import { localeDirection, translate, uiText } from './locale';

export function useLocale() {
  const { language } = useApp();
  return { language, rtl: localeDirection(language) === 'rtl', t: (source: string, params?: Record<string, string | number>) => translate(language, source, params) };
}
/** App-owned copy is translated; names, phone numbers and authored text explicitly opt out. */
export const Text = forwardRef<NativeText, TextProps & { verbatim?: boolean }>(function Text({ children, style, verbatim = false, ...props }, ref) {
  const { language, rtl, t } = useLocale();
  const flat = StyleSheet.flatten(style);
  return <NativeText {...props} ref={ref} accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined} style={[style, rtl && !verbatim && { writingDirection: 'rtl', letterSpacing: 0, textTransform: 'none', lineHeight: Math.max(flat?.lineHeight ?? 0, (flat?.fontSize ?? 14) * 1.6) }]}>{React.Children.map(children, child => typeof child === 'string' ? uiText(language, child, verbatim) : child)}</NativeText>;
});
export type TextInput = NativeInput;
export const TextInput = forwardRef<NativeInput, TextInputProps>(function TextInput(props, ref) {
  const { t, rtl } = useLocale();
  return <NativeInput {...props} ref={ref} placeholder={props.placeholder ? t(props.placeholder) : undefined} accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined} accessibilityHint={props.accessibilityHint ? t(props.accessibilityHint) : undefined} style={[rtl && { textAlign: 'right', writingDirection: 'rtl' }, props.style]}/>;
});
export const Pressable = forwardRef<React.ComponentRef<typeof NativePressable>, PressableProps>(function Pressable(props, ref) {
  const { t } = useLocale();
  const role = props.accessibilityRole ?? (props.onPress ? 'button' : undefined);
  return <NativePressable accessibilityRole={role} aria-pressed={role === 'button' ? props.accessibilityState?.selected : undefined} {...props} ref={ref} accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined} accessibilityHint={props.accessibilityHint ? t(props.accessibilityHint) : undefined}/>;
});
export const Switch = forwardRef<NativeSwitch, SwitchProps>(function Switch(props, ref) {
  const { t } = useLocale();
  return <NativeSwitch {...props} ref={ref} accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined} accessibilityHint={props.accessibilityHint ? t(props.accessibilityHint) : undefined}/>;
});
function directionProps(language: string) {
  return Platform.OS === 'web' ? { dir: localeDirection(language), lang: localeDirection(language) === 'rtl' ? 'ur-PK' : language === 'Roman Urdu' ? 'ur-Latn' : 'en' } : {};
}
export const SafeAreaView = forwardRef<View, SafeAreaViewProps>(function SafeAreaView(props, ref) {
  const { language } = useLocale();
  return <NativeSafeArea {...props} {...directionProps(language)} ref={ref} style={[Platform.OS !== 'web' && { direction: localeDirection(language) }, props.style]}/>;
});
export function LocaleView(props: ViewProps) {
  const { language } = useLocale();
  return <View {...props} {...directionProps(language)} style={[props.style, Platform.OS !== 'web' && { direction: localeDirection(language) }]}/>;
}
const mirrored = { 'arrow-back': 'arrow-forward', 'arrow-forward': 'arrow-back', 'chevron-back': 'chevron-forward', 'chevron-forward': 'chevron-back' } as const;
export const Ionicons = Object.assign(function Ionicons(props: React.ComponentProps<typeof NativeIcons>) {
  const { rtl, t } = useLocale();
  const name = rtl && props.name && props.name in mirrored ? mirrored[props.name as keyof typeof mirrored] : props.name;
  return <NativeIcons accessible={!!props.accessibilityLabel} aria-hidden={!props.accessibilityLabel && !props.accessible} {...props} name={name} accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined}/>;
}, { glyphMap: NativeIcons.glyphMap });
