import { Pressable, Text } from './localized-ui';
import { StyleSheet } from 'react-native';
import { colors, radius } from './theme';

export function EmergencyButton({ label, onPress, disabled = false, secondary = false }: { label: string; onPress(): void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, secondary && s.secondary, (pressed || disabled) && { opacity: .55 }]}><Text style={[s.label, secondary && { color: colors.primaryDark }]}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({ button: { minHeight: 52, padding: 14, borderRadius: radius.md, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#D8D1E8' }, label: { color: colors.surface, fontSize: 15, lineHeight: 24, fontWeight: '700', textAlign: 'center', writingDirection: 'auto' } });
