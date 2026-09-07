import type { ReactNode } from 'react';
export { router } from 'expo-router';

// Native navigation retains the platform's own focus management.
export function NavigationFocus({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
