import { useEffect } from 'react';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import type { FtfMotionProps } from './ftf-motion.types';

export function FtfMotion({ children, style, rotation = 0, enter = false }: FtfMotionProps) {
  const reduced = useReducedMotion();
  const angle = useSharedValue(rotation);
  const progress = useSharedValue(enter && !reduced ? 0 : 1);
  useEffect(() => {
    angle.value = withTiming(rotation, { duration: reduced ? 0 : 280, easing: Easing.inOut(Easing.quad) });
    return () => cancelAnimation(angle);
  }, [rotation, reduced, angle]);
  useEffect(() => {
    progress.value = withTiming(1, { duration: reduced ? 0 : 220 });
    return () => cancelAnimation(progress);
  }, [reduced, progress]);
  const motion = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ rotate: `${angle.value}deg` }, { translateY: (1 - progress.value) * 8 }] }));
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}
