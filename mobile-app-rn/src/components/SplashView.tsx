import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Logo } from './Logo';
import { colors } from '../theme';

/** Shown while fonts (and, before that, the OS-level native splash
 * configured in app.json) are loading. Reuses the same Logo component
 * every other screen does -- the admin-uploaded company logo if one's
 * set, falling back to the JDK MEA wordmark -- rather than a separate
 * hardcoded splash image, so a changed company logo shows up here too
 * with nothing to keep in sync.
 *
 * Unlike expo-splash-screen's native splash (image + backgroundColor in
 * app.json), this is a plain RN view -- it's what actually renders on
 * web (the PWA target this app is mainly used as), where there's no
 * native splash API to preventAutoHideAsync()/hideAsync() at all. */
export function SplashView() {
  return (
    <View style={styles.screen}>
      <Logo size={96} />
      <ActivityIndicator color={colors.gold400} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, alignItems: 'center', justifyContent: 'center', gap: 28 },
  spinner: { marginTop: 4 },
});
