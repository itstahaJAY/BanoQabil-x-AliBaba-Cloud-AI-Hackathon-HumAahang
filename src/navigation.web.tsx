import { router as expoRouter, usePathname } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { completeNavigationFocus, prepareNavigationFocus } from './navigation-focus';
import { useApp } from './store';
import { translate } from './locale';

function beforeNavigation() {
  if (typeof document !== 'undefined') prepareNavigationFocus(document);
}

// Preserve Expo's API and route/history semantics; only transfer web focus before dispatch.
export const router: typeof expoRouter = {
  ...expoRouter,
  push: (...args) => { beforeNavigation(); expoRouter.push(...args); },
  navigate: (...args) => { beforeNavigation(); expoRouter.navigate(...args); },
  replace: (...args) => { beforeNavigation(); expoRouter.replace(...args); },
  back: () => { beforeNavigation(); expoRouter.back(); },
  dismiss: (...args) => { beforeNavigation(); expoRouter.dismiss(...args); },
  dismissTo: (...args) => { beforeNavigation(); expoRouter.dismissTo(...args); },
  dismissAll: () => { beforeNavigation(); expoRouter.dismissAll(); },
};

export function NavigationFocus({ children }: { children: ReactNode }) {
  const { language } = useApp();
  const t = (value: string) => translate(language, value);
  const pathname = usePathname();
  const previous = useRef(pathname);
  useLayoutEffect(() => {
    if (previous.current !== pathname) {
      previous.current = pathname;
      completeNavigationFocus(document);
    }
  }, [pathname]);
  useEffect(() => {
    // Browser Back/Forward bypass the imperative router, but still need pre-transition focus.
    window.addEventListener('popstate', beforeNavigation, true);
    return () => window.removeEventListener('popstate', beforeNavigation, true);
  }, []);
  const routeTitles: Record<string, string> = { '/': 'Home', '/transcription': 'Live Transcription', '/conversation': 'Live conversation', '/contact-qr': 'Emergency contact QR', '/passport-settings': 'Passport details', '/emergency-settings': 'Emergency numbers', '/partner': 'Conversation partner', '/onboarding': 'Welcome', '/vision': 'AI Vision' };
  const name = routeTitles[pathname] || pathname.split('/').filter(Boolean).at(-1)?.replace(/-/g, ' ') || 'Home';
  useEffect(() => { document.title = t('Hum Ahang'); document.documentElement.lang = language === 'اردو' ? 'ur-PK' : language === 'Roman Urdu' ? 'ur-Latn' : 'en'; }, [language]);
  return <main data-navigation-root="" tabIndex={-1} aria-label={t('Hum Ahang') + ' · ' + t(name)} style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>{children}</main>;
}
