import { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { colors, fonts, whiteAlpha } from '../theme';

/** Persistent utility bar (Back / Logout) rendered as a sibling of the
 * Drawer.Navigator, not a screen inside it -- so it stays fixed and
 * identical across every drawer screen. It reaches navigation via a
 * ref (not the useNavigation() hook) because it isn't itself a
 * descendant of any Navigator's Screen, just of NavigationContainer. */
export function BottomActionBar({ navRef }: { navRef: NavigationContainerRefWithCurrent<any> }) {
  const { logout } = useAuth();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  function handleBack() {
    if (navRef.current?.canGoBack()) navRef.current.goBack();
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <Pressable onPress={handleBack} style={styles.action} hitSlop={10}>
        <Feather name="arrow-left" size={18} color={whiteAlpha(0.75)} />
        <Text style={styles.label}>{t('common', 'back')}</Text>
      </Pressable>
      <View style={styles.divider} />
      <Pressable onPress={logout} style={styles.action} hitSlop={10}>
        <Feather name="log-out" size={18} color={colors.red400} />
        <Text style={[styles.label, { color: colors.red400 }]}>{t('common', 'logout')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: whiteAlpha(0.08),
    backgroundColor: colors.ink900,
    paddingTop: 10,
  },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  divider: { width: 1, backgroundColor: whiteAlpha(0.08) },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, color: whiteAlpha(0.75) },
});
