import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  cream: '#FCFBFF', surface: '#FFFFFF', ink: '#171829', muted: '#737381',
  emerald: '#7657F6', emeraldDark: '#6042E8', emeraldBlack: '#5134D5',
  mint: '#E5F8EF', mintBright: '#CFF2E0', lime: '#EEE8FF', yellow: '#FFF4D7',
  red: '#E65A68', redSoft: '#FFECEF', line: '#F0EFF5', black: '#171829',
  primary: '#7657F6', primaryLight: '#EEE9FF', primaryDark: '#6042E8',
  pastelPurple: '#EEE8FF', pastelPink: '#FFECEF', pastelGreen: '#E5F8EF',
  pastelYellow: '#FFF4D7', pastelBlue: '#E8F5FF',
};
export const space = { xs: 4, sm: 8, md: 16, lg: 20, xl: 28, xxl: 40 };
export const radius = { sm: 12, md: 16, lg: 20, hero: 26, pill: 999 };
export const shadow: ViewStyle = Platform.OS === 'web'
  ? { boxShadow: '0px 6px 14px rgba(68, 54, 130, 0.07)' }
  : { shadowColor: '#443682', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 };
export const shadowStrong: ViewStyle = Platform.OS === 'web'
  ? { boxShadow: '0px 10px 20px rgba(81, 56, 182, 0.13)' }
  : { shadowColor: '#5138B6', shadowOpacity: 0.13, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 };
export const tabShadow: ViewStyle = Platform.OS === 'web'
  ? { boxShadow: '0px 0px 10px rgba(74, 56, 135, 0.04)' }
  : { elevation: 0, shadowColor: '#4A3887', shadowOpacity: 0.04, shadowRadius: 10 };
export const type = { display: 26, title: 18, card: 15, body: 13, meta: 11 };
export const sizes = { touch: 48, button: 54, icon: 22, tabBar: 74 };
