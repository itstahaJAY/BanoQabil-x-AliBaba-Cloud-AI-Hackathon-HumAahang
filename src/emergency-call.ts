import type { CallTarget } from './profile-data';

export type CallState = { phase: 'idle' | 'review' | 'opening' | 'requested' | 'error'; target: CallTarget | null; issue: '' | 'invalid' | 'failed' | 'timeout' };
export const idleCall: CallState = { phase: 'idle', target: null, issue: '' };
export function createEmergencyCall(open: (url: string) => Promise<unknown>, onState: (state: CallState) => void) {
  let state = idleCall, token = 0, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = (next: CallState) => { state = next; if (!disposed) onState(next); };
  const cancel = () => { token++; clearTimeout(timer); emit(idleCall); };
  return {
    review(target: CallTarget) {
      if (disposed || state.phase === 'opening') return;
      token++; clearTimeout(timer);
      if (!/^\+?\d{2,15}$/.test(target.number)) { emit({ ...idleCall, phase: 'error', issue: 'invalid' }); return; }
      emit({ phase: 'review', target: { ...target }, issue: '' });
    },
    async confirm() {
      if (disposed || state.phase !== 'review' || !state.target) return;
      const target = state.target, current = ++token;
      emit({ phase: 'opening', target, issue: '' });
      timer = setTimeout(() => {
        if (disposed || current !== token) return;
        token++;
        emit({ phase: 'error', target, issue: 'timeout' });
      }, 10000);
      try {
        // The sole phone side effect. Never call from selection, render, mount or retry timers.
        await open(`tel:${target.number}`);
        if (!disposed && current === token) emit({ phase: 'requested', target, issue: '' });
      } catch {
        if (!disposed && current === token) emit({ phase: 'error', target, issue: 'failed' });
      } finally { if (current === token) clearTimeout(timer); }
    },
    cancel,
    dispose() { disposed = true; cancel(); },
  };
}
