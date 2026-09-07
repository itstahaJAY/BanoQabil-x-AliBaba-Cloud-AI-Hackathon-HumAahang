export type SwipeDirection = 'up' | 'down' | 'left' | 'right';
export type NavigationGesture = SwipeDirection | 'double-left' | 'double-right';
export function swipeDirection(dx: number, dy: number, durationMs: number, touches = 1): SwipeDirection | null {
  if (![dx, dy, durationMs].every(Number.isFinite) || touches !== 1 || durationMs < 0 || durationMs > 1200) return null;
  const x = Math.abs(dx), y = Math.abs(dy);
  if (Math.max(x, y) < 48 || Math.max(x, y) < Math.min(x, y) * 1.4) return null;
  return x > y ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'up' : 'down';
}
export const navigationRoutes = {
  up: '/vision', down: '/emergency', right: '/transcription',
  left: '/conversation?partner=hearing&face=1',
  'double-left': '/sign-assistant', 'double-right': '/passport',
} as const;
export function createNavigationGestures(navigate: (action: NavigationGesture) => void, clock: {
  now(): number; setTimer(callback: () => void, delay: number): unknown; clearTimer(timer: unknown): void;
} = { now: Date.now, setTimer: (callback, delay) => setTimeout(callback, delay), clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) }) {
  let pending: { direction: 'left' | 'right'; until: number } | null = null;
  let second: 'left' | 'right' | null = null;
  let timer: unknown;
  const clearTimer = () => { if (timer !== undefined) clock.clearTimer(timer); timer = undefined; };
  const cancel = () => { clearTimer(); pending = null; second = null; };
  return {
    begin() {
      // Suspend the first action on touch-down, not release: a slower second swipe
      // must never allow the single destination to open underneath the user's finger.
      second = pending && clock.now() <= pending.until ? pending.direction : null;
      clearTimer(); pending = null;
    },
    swipe(direction: SwipeDirection) {
      const first = second; cancel();
      if (direction === 'up' || direction === 'down') { navigate(direction); return; }
      if (first === direction) { navigate(direction === 'left' ? 'double-left' : 'double-right'); return; }
      pending = { direction, until: clock.now() + 420 };
      timer = clock.setTimer(() => { const action = pending?.direction; cancel(); if (action) navigate(action); }, 420);
    },
    cancel,
  };
}
