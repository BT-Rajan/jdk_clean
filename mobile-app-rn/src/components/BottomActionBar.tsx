import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { colors, fonts, whiteAlpha } from '../theme';

/** Persistent utility bar (Logout) rendered as a sibling of the
 * Drawer.Navigator, not a screen inside it -- so it stays fixed and
 * identical across every drawer screen.
 *
 * Back navigation deliberately isn't a button here -- RootNavigator's
 * `linking` config syncs the app's navigation state with browser
 * history, so the phone's own back button/gesture (which, for an
 * installed PWA with no visible browser chrome, Android still routes
 * to the frontmost web app's history) does that job directly. */
export function BottomActionBar() {
  const { logout } = useAuth();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <Pressable onPress={logout} style={styles.action} hitSlop={10}>
        <Feather name="log-out" size={18} color={colors.red400} />
        <Text style={[styles.label, { color: colors.red400 }]}>{t('common', 'logout')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    borderTopColor: whiteAlpha(0.08),
    backgroundColor: colors.ink900,
    paddingTop: 10,
  },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, color: whiteAlpha(0.75) },
});
