import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Logo } from '../components/Logo';
import { colors, fonts } from '../theme';

/** Persistent branded header content: company logo + name, shown at the
 * top of every top-level drawer screen. hideWordmark on the Logo itself
 * avoids double-printing the name when it falls back to its own glyph
 * wordmark -- this component is the single source of the name text.
 * Doubles as a "go home" shortcut, the same convention most apps use
 * for their header logo -- this renders straight on the Drawer
 * Navigator itself (see RootNavigator's screenOptions), so `navigate`
 * here targets Home directly with no cross-stack indirection needed. */
export function HeaderTitle() {
  const navigation = useNavigation();
  return (
    <Pressable
      onPress={() => navigation.navigate('Home' as never)}
      hitSlop={10}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Logo size={28} hideWordmark />
      <Text style={styles.text}>
        JDK <Text style={{ color: colors.gold400 }}>MEA</Text>
      </Text>
    </Pressable>
  );
}

/** Small glyph-only logo paired with the screen's own title, for every
 * *detail* screen inside a drawer stack (Feasibility Report, Order
 * Detail, Client Form, etc.) -- those set a specific `title` rather
 * than rendering HeaderTitle above, so without this they were the only
 * screens in the app with no logo at all. Wired once as the default
 * `headerTitle` in RootNavigator's shared `stackScreenOptions` rather
 * than per-screen, so a newly added detail screen gets it automatically
 * and can't be missed. Not pressable/no "go home" shortcut here (unlike
 * HeaderTitle above) -- the back chevron already covers going back, and
 * a second navigation shortcut competing with the title text would be
 * confusing on a screen that's mid-flow. */
export function DetailHeaderTitle({ children }: { children?: string }) {
  return (
    <View style={styles.detailRow}>
      <Logo size={22} hideWordmark />
      <Text style={styles.detailText} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: 0.7 },
  text: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  detailText: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.white },
});
