import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, PanResponder, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { swipeDirection, type SwipeDirection } from './gesture-model';
import { useLocale } from './localized-ui';

type Props = {
  enabled: boolean; onSwipe(direction: SwipeDirection): void;
  axis?: 'horizontal' | 'both';
  onGestureStart?(): void; onGestureCancel?(): void;
  accessibilityLabel: string; style?: StyleProp<ViewStyle>; children: React.ReactNode;
};
/** Capture only an explicitly bounded pad. This must not wrap scrollable content or buttons. */
export function GestureSurface(props: Props) {
  const { t } = useLocale();
  // RN Web reports `true` unconditionally; it is not browser AT detection.
  // Native detection suppresses raw gestures. Web keeps the explicit opt-out
  // and equivalent buttons because screen readers own their own swipe layer.
  const [screenReader, setScreenReader] = useState<boolean | null>(Platform.OS === 'web' ? false : null);
  const latest = useRef(props); latest.current = props;
  const enabled = useRef(false); enabled.current = props.enabled && screenReader === false;
  const gesture = useRef<{ at: number; maxTouches: number } | null>(null);
  const cancel = () => { gesture.current = null; latest.current.onGestureCancel?.(); };
  useEffect(() => {
    let mounted = true;
    let changed = false;
    if (Platform.OS !== 'web') AccessibilityInfo.isScreenReaderEnabled().then(value => { if (mounted && !changed) setScreenReader(value); }).catch(() => { if (mounted && !changed) setScreenReader(true); });
    const sr = Platform.OS !== 'web' ? AccessibilityInfo.addEventListener('screenReaderChanged', value => { changed = true; cancel(); setScreenReader(value); }) : null;
    const app = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    const hidden = () => { if (document.visibilityState !== 'visible') cancel(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', hidden);
    return () => { mounted = false; sr?.remove(); app.remove(); if (Platform.OS === 'web') document.removeEventListener('visibilitychange', hidden); cancel(); };
  }, []);
  useEffect(() => { if (!enabled.current) cancel(); }, [props.enabled, screenReader]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => enabled.current && latest.current.axis !== 'horizontal',
    onMoveShouldSetPanResponder: (_event, state) => enabled.current && (latest.current.axis !== 'horizontal' || (Math.abs(state.dx) > 8 && Math.abs(state.dx) > Math.abs(state.dy) * 1.4)),
    onPanResponderGrant: (_event, state) => {
      if (!enabled.current) return;
      gesture.current = { at: Date.now(), maxTouches: state.numberActiveTouches };
      latest.current.onGestureStart?.();
    },
    onPanResponderMove: (_event, state) => { if (gesture.current) gesture.current.maxTouches = Math.max(gesture.current.maxTouches, state.numberActiveTouches); },
    onPanResponderRelease: (_event, state) => {
      const start = gesture.current; gesture.current = null;
      const direction = start && enabled.current ? swipeDirection(state.dx, state.dy, Date.now() - start.at, start.maxTouches) : null;
      if (direction && (latest.current.axis !== 'horizontal' || direction === 'left' || direction === 'right')) latest.current.onSwipe(direction); else latest.current.onGestureCancel?.();
    },
    onPanResponderTerminate: cancel,
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => true,
  }), []);
  return <View {...responder.panHandlers} {...(Platform.OS === 'web' ? { dir: 'ltr' } : {})} accessibilityLabel={t(props.accessibilityLabel)} accessible={false} style={[props.style, Platform.OS !== 'web' && { direction: 'ltr' }, Platform.OS === 'web' && ({ touchAction: enabled.current ? props.axis === 'horizontal' ? 'pan-y' : 'none' : 'auto', userSelect: 'none' } as ViewStyle)]}>{props.children}</View>;
}
