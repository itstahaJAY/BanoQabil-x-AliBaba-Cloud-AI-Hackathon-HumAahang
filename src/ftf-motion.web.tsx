import gsap from 'gsap';
import { useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';
import type { FtfMotionProps } from './ftf-motion.types';

// Web-only boundary: Metro never includes GSAP in the native app bundle.
export function FtfMotion({ children, style, rotation = 0, enter = false }: FtfMotionProps) {
  const node = useRef<View>(null);
  const scope = useRef<gsap.Context | null>(null);
  const angle = useRef(rotation);
  const reduced = useRef(false);
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add({ reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, state => {
        reduced.current = !!state.conditions?.reduce;
        gsap.set(node.current, { rotation: angle.current, overwrite: 'auto' });
        if (enter && !reduced.current) gsap.fromTo(node.current, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.22, ease: 'power2.out', clearProps: 'opacity,visibility' });
      });
    });
    scope.current = context;
    return () => { media.revert(); context.revert(); scope.current = null; };
  }, [enter]);
  useLayoutEffect(() => {
    angle.current = rotation;
    let tween: gsap.core.Tween | undefined;
    scope.current?.add(() => {
      tween = gsap.to(node.current, { rotation, duration: reduced.current ? 0 : 0.28, ease: 'power2.inOut', overwrite: 'auto', transformOrigin: '50% 50%' });
    });
    // Kill only this tween on interruption; do not revert to the initial angle.
    return () => { tween?.kill(); };
  }, [rotation]);
  return <View ref={node} style={style}>{children}</View>;
}
