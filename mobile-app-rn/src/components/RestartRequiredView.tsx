import { StyleSheet, Text, View } from 'react-native';
import { Logo } from './Logo';
import { useLocale } from '../i18n/LocaleContext';
import { colors, fonts, whiteAlpha } from '../theme';

/** Shown instead of the app's normal screens, native-only, whenever
 * useLocale().needsRestart is true -- i.e. the selected language's
 * writing direction doesn't match the direction this process actually
 * booted with. I18nManager.forceRTL() only takes effect on the *next*
 * app launch (see LocaleContext.tsx), so continuing to render the real
 * app in that gap would mean showing screens -- the drawer above all --
 * whose own RTL-position math is reading a native flag that's now stale.
 * Blocking here instead is what makes it safe to trust the drawer's
 * default open/close gestures rather than needing a manual workaround:
 * the drawer is simply never shown until direction and native boot state
 * agree again. */
export function RestartRequiredView() {
  const { t } = useLocale();
  return (
    <View style={styles.screen}>
      <Logo size={72} />
      <Text style={styles.title}>{t('restartRequired', 'title')}</Text>
      <Text style={styles.body}>{t('restartRequired', 'body')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink950,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  title: { fontFamily: fonts.sansSemibold, fontSize: 18, color: colors.white, textAlign: 'center' },
  body: { fontFamily: fonts.sansMedium, fontSize: 14, color: whiteAlpha(0.65), textAlign: 'center' },
});
