import { StyleSheet, Text, View } from 'react-native';
import { Logo } from '../components/Logo';
import { colors, fonts } from '../theme';

/** The one and only header content used across the whole app: a small
 * logo next to whatever title the current screen sets. Wired as the
 * single default `headerTitle` for both the Drawer navigator and every
 * nested stack (see RootNavigator's `screenOptions`/`stackScreenOptions`)
 * -- no screen sets its own headerTitle any more, so every page renders
 * from this one component and can't drift into a different look.
 * `children` is passed in automatically by react-navigation, resolved
 * from that screen's own `options.title`. */
export function HeaderTitle({ children }: { children?: string }) {
  return (
    <View style={styles.row}>
      <Logo size={24} hideWordmark />
      <Text style={styles.text} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  text: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.white },
});
