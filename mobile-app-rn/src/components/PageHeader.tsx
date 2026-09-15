import { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts } from '../theme';

/** The bold page-title row every top-level drawer screen (Home, Product
 * Catalog, Clients, Quotations, Orders, History) shows under the shared
 * app header -- previously each screen copy-pasted its own near-
 * identical title/action row with small drift between them (a couple of
 * pixels of font size, whether an action button was included). One
 * shared component so they can't drift again. `action` is typically a
 * "+ New"-style button; `style` lets a screen override the default
 * bottom margin (e.g. when a subtitle line follows immediately under
 * the title, like MyHistoryScreen's month label). */
export function PageHeader({ title, action, style }: { title: string; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.header, style]}>
      <Text style={styles.title}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.white, flex: 1 },
});
