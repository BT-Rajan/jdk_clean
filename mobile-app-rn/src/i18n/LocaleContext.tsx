import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Alert as RNAlert, I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Locale, translations } from './translations';

const LOCALE_KEY = 'qq_locale';
const RTL_LOCALES: Locale[] = ['ar'];

type Dict = typeof translations.en;

interface LocaleContextValue {
  locale: Locale;
  isRTL: boolean;
  setLocale: (locale: Locale) => Promise<void>;
  t: <S extends keyof Dict>(section: S, key: keyof Dict[S], params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Applies RTL layout direction for the given locale. Web and native
 * need genuinely different mechanisms here -- see applyRTL's own
 * comments for why -- so this is the one place that decides which. */
function applyRTL(locale: Locale) {
  const rtl = RTL_LOCALES.includes(locale);
  if (Platform.OS === 'web') {
    // react-native-web's I18nManager is a hardcoded no-op stub (see its
    // source: allowRTL()/forceRTL() both literally `return;`, isRTL is
    // always false) -- calling it here would silently do nothing. The
    // real, browser-native mechanism is the <html> `dir` attribute:
    // CSS's `flex-direction: row` is *already* defined relative to
    // directionality ("main-start is on the left in LTR, on the right
    // in RTL"), so setting `dir` alone correctly mirrors every row
    // layout in the app with no reload needed -- instant, and it's why
    // this function doesn't need to be async or trigger a reload on web.
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    return;
  }
  // Native's I18nManager is real here (unlike the web stub above), but
  // only takes effect from the next app launch -- it's read once at
  // native bridge init, not something already-mounted native views can
  // re-flow in place.
  if (rtl !== I18nManager.isRTL) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(LOCALE_KEY);
      const initial = stored === 'en' || stored === 'ar' ? stored : 'en';
      applyRTL(initial);
      setLocaleState(initial);
      setReady(true);
    })();
  }, []);

  async function setLocale(next: Locale) {
    await AsyncStorage.setItem(LOCALE_KEY, next);
    const wasRTL = RTL_LOCALES.includes(locale);
    const nextRTL = RTL_LOCALES.includes(next);
    applyRTL(next);
    setLocaleState(next);

    // Only native has a real relaunch requirement (see applyRTL) -- web
    // already re-flowed instantly above, nothing further to do there.
    if (Platform.OS !== 'web' && nextRTL !== wasRTL) {
      RNAlert.alert(
        next === 'ar' ? 'أعد تشغيل التطبيق' : 'Restart the app',
        next === 'ar'
          ? 'أغلق التطبيق وأعد فتحه لتطبيق اتجاه الكتابة من اليمين إلى اليسار بالكامل.'
          : 'Close and reopen the app to fully apply the new layout direction.',
      );
    }
  }

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      isRTL: RTL_LOCALES.includes(locale),
      setLocale,
      t: (section, key, params) => {
        let str: string = (translations[locale][section] as Record<string, string>)[key as string];
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            str = str.replace(`{{${k}}}`, String(v));
          }
        }
        return str;
      },
    }),
    [locale],
  );

  // Wait for the persisted choice to load (and RTL to be applied) before
  // rendering anything -- avoids a flash of the wrong language/direction
  // on launch.
  if (!ready) return null;

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider.');
  return ctx;
}
