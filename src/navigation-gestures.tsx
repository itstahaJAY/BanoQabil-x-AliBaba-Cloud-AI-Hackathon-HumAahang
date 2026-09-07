import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Keyboard, Modal, Platform, ScrollView, StyleSheet, View, findNodeHandle, useWindowDimensions } from 'react-native';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { Pressable, SafeAreaView, Text, Ionicons, useLocale } from './localized-ui';
import { GestureSurface } from './gesture-surface';
import { createNavigationGestures, navigationRoutes, type NavigationGesture } from './gesture-model';
import { router } from './navigation';
import { useApp } from './store';
import { colors, radius } from './theme';

const destinations: { action: NavigationGesture; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { action: 'up', label: 'AI Vision', hint: 'Swipe up', icon: 'scan-outline' },
  { action: 'down', label: 'Emergency', hint: 'Swipe down', icon: 'medical-outline' },
  { action: 'right', label: 'Live Captions', hint: 'Swipe right', icon: 'mic-outline' },
  { action: 'left', label: 'Face-to-face', hint: 'Swipe left', icon: 'people-outline' },
  { action: 'double-left', label: 'Sign Assistant', hint: 'Double swipe left', icon: 'hand-left-outline' },
  { action: 'double-right', label: 'Passport', hint: 'Double swipe right', icon: 'id-card-outline' },
];
export function NavigationGestures() {
  const { prefs } = useApp();
  const { t } = useLocale();
  const { height, width } = useWindowDimensions();
  const landscape = (Platform.OS === 'web' ? Math.min(width, 430) : width) > height;
  const sheetHeight = height * (landscape ? .82 : .55);
  const padHeight = Math.min(220, Math.max(landscape ? 144 : 190, height * .28));
  const pathname = usePathname(), params = useGlobalSearchParams<{ face?: string; partner?: string }>();
  const [expanded, setExpanded] = useState(false), [keyboard, setKeyboard] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const trigger = useRef<View>(null), closeButton = useRef<View>(null);
  const scroll = useRef<ScrollView>(null), buttonsOffset = useRef(0);
  const inertRoot = useRef<HTMLElement | null>(null);
  const open = useRef(false); open.current = expanded;
  const releaseBackground = () => { inertRoot.current?.removeAttribute('inert'); inertRoot.current = null; };
  const close = () => { recognition.current?.cancel(); releaseBackground(); setExpanded(false); };
  const restoreFocus = () => {
    releaseBackground();
    if (open.current) return;
    if (Platform.OS === 'web') (trigger.current as unknown as HTMLElement | null)?.focus({ preventScroll: true });
    else {
      const tag = findNodeHandle(trigger.current);
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }
  };
  const permitted = useRef(false);
  permitted.current = expanded && prefs.gestures && !keyboard && pathname !== '/onboarding';
  const navigate = (action: NavigationGesture) => {
    close();
    // These are navigation-only destinations. Calling, sharing and requesting
    // camera permission remain explicit controls owned by the destination screen.
    router.navigate(navigationRoutes[action]);
  };
  const latestNavigate = useRef(navigate); latestNavigate.current = navigate;
  const recognition = useRef<ReturnType<typeof createNavigationGestures> | null>(null);
  if (!recognition.current) recognition.current = createNavigationGestures(action => { if (permitted.current) latestNavigate.current(action); });
  useEffect(() => { close(); }, [pathname, params.face, params.partner]);
  useEffect(() => { if (!prefs.gestures || keyboard || !expanded) recognition.current?.cancel(); }, [prefs.gestures, keyboard, expanded]);
  useEffect(() => {
    const cancel = () => recognition.current?.cancel();
    const shown = Keyboard.addListener('keyboardDidShow', () => { close(); setKeyboard(true); });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    const app = AppState.addEventListener('change', state => { if (state !== 'active') close(); });
    const visibility = () => { if (document.visibilityState !== 'visible') close(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', visibility);
    return () => { shown.remove(); hidden.remove(); app.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', visibility); cancel(); releaseBackground(); };
  }, []);
  useEffect(() => {
    let mounted = true, changed = false;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted && !changed) setReducedMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setReducedMotion(value); });
    return () => { mounted = false; subscription?.remove(); };
  }, []);
  if (pathname === '/onboarding' || keyboard) return null;
  return <SafeAreaView edges={['bottom']} style={s.shell}>
    <Pressable ref={trigger} accessibilityLabel="Navigation shortcuts" aria-expanded={expanded} aria-haspopup="dialog" accessibilityState={{ expanded }} onPress={() => { recognition.current?.cancel(); setExpanded(true); }} style={s.toggle}>
      <Ionicons name="compass-outline" size={19} color={colors.primaryDark}/><Text style={s.title}>Navigation shortcuts</Text><Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={18} color={colors.muted}/>
    </Pressable>
    <Modal transparent visible={expanded} animationType={reducedMotion ? 'none' : 'fade'} presentationStyle="overFullScreen" supportedOrientations={['portrait', 'landscape']} onRequestClose={close} onDismiss={restoreFocus} accessibilityLabel={t('Navigation shortcuts')} onShow={() => {
      if (!open.current) return;
      if (Platform.OS === 'web') {
        (closeButton.current as unknown as HTMLElement | null)?.focus({ preventScroll: true });
        const root = document.querySelector<HTMLElement>('[data-navigation-root]');
        if (root && !root.hasAttribute('inert')) { root.setAttribute('inert', ''); inertRoot.current = root; }
      } else {
        const tag = findNodeHandle(closeButton.current);
        if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
      }
    }}>
      <View style={s.overlay}>
        {/* No tabIndex, focusable prop or button role: even tabIndex=-1 can be
            focused programmatically by RN Web's modal focus trap. */}
        <View accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" onStartShouldSetResponder={() => true} onResponderRelease={close} style={s.scrim}/>
        <SafeAreaView edges={['bottom']} accessibilityViewIsModal style={[s.sheet, { height: sheetHeight, maxWidth: Platform.OS === 'web' ? 430 : undefined }]}>
          <View style={s.handle}/>
          <View style={s.sheetHeader}><Text accessibilityRole="header" style={s.sheetTitle}>Navigation shortcuts</Text><Pressable accessibilityLabel="Show navigation buttons" onPress={() => { recognition.current?.cancel(); scroll.current?.scrollTo({ y: buttonsOffset.current, animated: !reducedMotion }); }} style={s.showButtons}><Text style={s.buttonLabel}>Buttons</Text></Pressable><Pressable ref={closeButton} accessibilityLabel="Close navigation shortcuts" onPress={close} style={s.close}><Ionicons name="close" size={24} color={colors.ink}/></Pressable></View>
          <ScrollView ref={scroll} style={s.expanded} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <GestureSurface enabled={prefs.gestures && expanded} onSwipe={direction => recognition.current?.swipe(direction)} onGestureStart={() => recognition.current?.begin()} onGestureCancel={() => recognition.current?.cancel()} accessibilityLabel="Navigation swipe area" style={[s.pad, { minHeight: padHeight }, !prefs.gestures && s.disabled]}>
        <Ionicons name="move-outline" size={32} color={colors.primaryDark}/><Text style={s.padTitle}>{prefs.gestures ? 'Swipe here to navigate' : 'Gestures are off'}</Text>
        <Text style={s.helper}>Only this pad changes pages. Use the buttons with a screen reader.</Text>
      </GestureSurface>
      <Text style={s.helper}>For a double swipe, lift your finger and begin the second swipe promptly. Single left/right waits briefly.</Text>
      <View onLayout={event => { buttonsOffset.current = event.nativeEvent.layout.y; }} style={s.grid}>{destinations.map(item => <Pressable key={item.action} onPress={() => navigate(item.action)} accessibilityLabel={item.label} accessibilityHint={item.hint} style={s.destination}>
        <Ionicons name={item.icon} size={20} color={item.action === 'down' ? colors.red : colors.primaryDark}/><View style={s.destinationCopy}><Text style={s.destinationTitle}>{item.label}</Text><Text style={s.direction}>{item.hint}</Text></View>
      </Pressable>)}</View>
      <Pressable onPress={() => { close(); router.navigate('/settings'); }} style={s.settings}><Text style={s.settingsText}>Manage gestures in Settings</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  shell: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  toggle: { minHeight: 44, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' }, scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(25,20,42,.4)' },
  sheet: { width: '100%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  handle: { height: 4, width: 38, borderRadius: 2, backgroundColor: '#C7C2D4', alignSelf: 'center', marginTop: 10 },
  sheetHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 }, sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.ink }, close: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  showButtons: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' }, buttonLabel: { fontSize: 12, color: colors.primaryDark, textDecorationLine: 'underline', fontWeight: '700' },
  expanded: { flex: 1 }, content: { padding: 16, paddingTop: 0, gap: 12, paddingBottom: 24 },
  pad: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#8270C9', borderRadius: radius.md, backgroundColor: '#F4F0FE', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  disabled: { backgroundColor: '#F2F2F5', borderColor: '#B1ADBC' },
  padTitle: { fontSize: 16, fontWeight: '700', color: colors.primaryDark }, helper: { fontSize: 12, lineHeight: 18, color: '#625D71', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, destination: { width: '48%', minHeight: 55, flexDirection: 'row', alignItems: 'center', padding: 9, gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm },
  destinationCopy: { flex: 1 }, destinationTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' }, direction: { fontSize: 10, color: '#625D71', marginTop: 3 },
  settings: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, settingsText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
});
