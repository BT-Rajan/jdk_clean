import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Logo } from '../components/Logo';
import { colors, fonts } from '../theme';

/** The one and only header content used across the whole app: a small
 * logo next to whatever title the current screen sets, tappable to jump
 * straight to Home from anywhere. Wired as the single default
 * `headerTitle` for both the Drawer navigator and every nested stack
 * (see RootNavigator's `screenOptions`/`stackScreenOptions`) -- no
 * screen sets its own headerTitle any more, so every page renders from
 * this one component and can't drift into a different look.
 * `children` is passed in automatically by react-navigation, resolved
 * from that screen's own `options.title`. `navigate('Home')` bubbles up
 * to the parent Drawer navigator on its own when called from inside a
 * nested stack (ClientForm, OrderDetail, etc.) -- standard React
 * Navigation behavior, no extra plumbing needed here. Deliberately
 * applies everywhere, including mid-edit form screens, per explicit
 * instruction -- there's no unsaved-changes guard on this shortcut. */
export function HeaderTitle({ children }: { children?: string }) {
  const navigation = useNavigation();
  return (
    <Pressable
      onPress={() => navigation.navigate('Home' as never)}
      hitSlop={10}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Logo size={24} hideWordmark />
      <Text style={styles.text} numberOfLines={1}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  pressed: { opacity: 0.7 },
  text: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.white },
});
