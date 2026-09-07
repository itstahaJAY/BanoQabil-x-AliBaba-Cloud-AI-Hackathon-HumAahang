import { Text, Ionicons } from './localized-ui';

import { StyleSheet, View } from 'react-native';
import { passportPresentation, type PassportSettings } from './profile-data';
import { personas } from './types';
import { colors, radius } from './theme';

// Display and preview use the same projection; hidden fields never reach rendered text.
export function PassportCard({ value }: { value: PassportSettings }) {
  const card = passportPresentation(value, personas[value.persona].title);
  return <View style={s.card}>
    <View style={s.top}><View style={{ flex: 1 }}><Text style={s.brand}>HUM AHANG</Text><Text style={s.title}>Communication passport</Text></View><Ionicons name="accessibility-outline" size={28} color={colors.lime} accessible={false}/></View>
    {card.name ? <Text verbatim selectable style={s.name}>{card.name}</Text> : null}
    <Text style={s.profile}>{card.personaTitle}</Text>
    <View style={s.message}><Text style={s.label}>HOW TO COMMUNICATE WITH ME</Text><Text verbatim selectable style={s.instructions}>{card.instructions}</Text></View>
    <View style={s.field}><Text style={s.label}>PREFERRED LANGUAGE</Text><Text selectable style={s.value}>{card.language}</Text></View>
    {card.contact ? <View style={s.field}><Text style={s.label}>EMERGENCY CONTACT</Text><Text verbatim selectable style={[s.value, { writingDirection: 'ltr' }]}>{card.contact}</Text></View> : null}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: '#28243D', padding: 24, borderRadius: radius.hero, gap: 20 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, brand: { fontSize: 10, letterSpacing: 2, fontWeight: '800', color: '#CDC2FF' },
  title: { fontSize: 13, color: '#E4DFF5', marginTop: 5 }, name: { fontSize: 27, lineHeight: 34, fontWeight: '700', color: colors.surface },
  profile: { fontSize: 13, lineHeight: 20, color: '#E4DFF5', borderLeftWidth: 3, borderLeftColor: '#B9A7FF', paddingLeft: 12 },
  message: { paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#FFFFFF26', gap: 10 },
  label: { fontSize: 10, lineHeight: 15, letterSpacing: 1, fontWeight: '700', color: '#C4BED7' },
  instructions: { fontSize: 21, lineHeight: 31, fontWeight: '600', color: colors.surface, writingDirection: 'auto' },
  field: { gap: 5 }, value: { fontSize: 16, lineHeight: 24, color: colors.surface, writingDirection: 'auto' },
});
