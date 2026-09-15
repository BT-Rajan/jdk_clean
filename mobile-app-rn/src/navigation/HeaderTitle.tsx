import { Pressable, StyleSheet, Text } from 'react-native';
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: 0.7 },
  text: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
});
