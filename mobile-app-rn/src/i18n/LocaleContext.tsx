import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Alert as RNAlert, I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Locale, translations } from './translations';

const LOCALE_KEY = 'qq_locale';
const RTL_LOCALES: Locale[] = ['ar'];

// The real, physical layout direction this native process booted with --
// unlike I18nManager.isRTL (see applyRTL's own comment), this can't
// change during the app's lifetime, which is exactly why it's the right
// thing to compare the *desired* direction against below: a mismatch
// here means native views are still laid out for the old direction and
// won't be reflown until an actual relaunch. Meaningless on web (see
// applyRTL's web branch), so left false there.
const nativeIsRTL = Platform.OS !== 'web' && I18nManager.getConstants().isRTL;

type Dict = typeof translations.en;

interface LocaleContextValue {
  locale: Locale;
  isRTL: boolean;
  /** True on native only: the selected locale's direction doesn't match
   * the direction this process actually booted with (I18nManager.forceRTL
   * only takes effect on the next app launch), so anything relying on the
   * platform's own RTL detection -- notably @react-navigation/drawer's
   * open/close position math -- would render in the wrong place until a
   * real relaunch happens. Screens should block on this rather than let
   * the user reach a half-mirrored drawer. Always false on web, which
   * re-flows instantly (see applyRTL) and never needs a relaunch. */
  needsRestart: boolean;
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

    // The `dir` attribute above instantly mirrors anything laid out with
    // ordinary flexbox -- but @react-navigation/drawer doesn't use dir at
    // all for its own sliding panel: it asks I18nManager.getConstants()
    // .isRTL directly (both for which side to default to and for the
    // pixel offset it animates to/from), and that stub always says
    // `false`. Left alone, the panel's own position math silently assumes
    // LTR forever, no matter what `dir` says -- confirmed by hand: in
    // Arabic the drawer rendered part-open/garbled at rest, and reading
    // it back open landed it 160px off the right edge of the screen,
    // clipped. I18nManager here is a plain mutable object (there's no
    // real native bridge to protect, see the no-op methods below), so
    // patch getConstants() to report the same direction `dir` just did --
    // it's a synchronous function every reader calls fresh, so this
    // takes effect on next render, no reload needed, same as `dir`.
    (I18nManager as unknown as { getConstants: () => { isRTL: boolean; doLeftAndRightSwapInRTL: boolean } }).getConstants =
      () => ({ isRTL: rtl, doLeftAndRightSwapInRTL: true });
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
      needsRestart: Platform.OS !== 'web' && RTL_LOCALES.includes(locale) !== nativeIsRTL,
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
