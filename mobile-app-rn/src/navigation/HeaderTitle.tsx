import { StyleSheet, Text, View } from 'react-native';
import { Logo } from '../components/Logo';
import { colors, fonts } from '../theme';

/** Persistent branded header content: company logo + name, shown at the
 * top of every top-level drawer screen. hideWordmark on the Logo itself
 * avoids double-printing the name when it falls back to its own glyph
 * wordmark -- this component is the single source of the name text. */
export function HeaderTitle() {
  return (
    <View style={styles.row}>
      <Logo size={28} hideWordmark />
      <Text style={styles.text}>
        JDK <Text style={{ color: colors.gold400 }}>MEA</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
});
