import { DrawerContentComponentProps, DrawerContentScrollView } from '@react-navigation/drawer';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { LanguageToggle } from '../components/LanguageToggle';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { colors, fonts, whiteAlpha } from '../theme';

// Order mirrors the home screen's own icon grid: Product catalog,
// Clients, Quotations, Orders -- History is drawer-only (not one of
// the home tiles).
const ITEMS: {
  route: string;
  icon: keyof typeof Feather.glyphMap;
  labelKey: 'productCatalog' | 'clients' | 'quotations' | 'orders' | 'history';
}[] = [
  { route: 'ProductCatalog', icon: 'box', labelKey: 'productCatalog' },
  { route: 'Clients', icon: 'users', labelKey: 'clients' },
  { route: 'Quotations', icon: 'file-text', labelKey: 'quotations' },
  { route: 'Orders', icon: 'package', labelKey: 'orders' },
  { route: 'History', icon: 'clock', labelKey: 'history' },
];

export function DrawerContent(props: DrawerContentComponentProps) {
  const { username, logout } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const insets = useSafeAreaInsets();
  const activeRoute = props.state.routes[props.state.index]?.name;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink900 }}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <Logo size={40} hideWordmark />
              <Text style={styles.brandText}>
                JDK <Text style={{ color: colors.gold400 }}>MEA</Text>
              </Text>
            </View>
            {/* A plain button dispatching closeDrawer() directly, rather
                than relying only on the swipe gesture or tap-outside
                overlay -- both of those go through the drawer library's
                own reanimated pan-gesture/overlay-touch handling, which
                has a known-fragile interaction with iOS + RTL (see
                @react-navigation/drawer's modern/Drawer.tsx: it re-derives
                its own RTL offset assuming the native view tree is
                already laid out to match I18nManager.isRTL, which can
                get out of sync with the JS-side flag on iOS -- this
                button bypasses that gesture/overlay layer entirely. */}
            <Pressable onPress={() => props.navigation.closeDrawer()} hitSlop={12} style={styles.closeBtn}>
              <Feather name="x" size={20} color={whiteAlpha(0.6)} />
            </Pressable>
          </View>
          {username ? <Text style={styles.username}>{t('account', 'signedInAs', { username })}</Text> : null}
        </View>

        <View style={styles.items}>
          {ITEMS.map((item) => {
            const focused = activeRoute === item.route;
            return (
              <Pressable
                key={item.route}
                onPress={() => props.navigation.navigate(item.route)}
                style={[styles.item, focused && styles.itemActive]}
              >
                <Feather name={item.icon} size={18} color={focused ? colors.gold400 : whiteAlpha(0.65)} />
                <Text style={[styles.itemText, focused && styles.itemTextActive]}>{t('drawer', item.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      </DrawerContentScrollView>

      {/* Pinned below the scrollable nav items, not inside them -- logout
          (and now language) should stay reachable without scrolling
          however long the nav list grows. Previously the only place to
          change language was the login screen, with no way back to it
          once signed in. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.languageRow}>
          <Text style={styles.itemText}>{t('drawer', 'language')}</Text>
          <LanguageToggle locale={locale} onChange={setLocale} />
        </View>
        <Pressable onPress={logout} style={styles.item} hitSlop={10}>
          <Feather name="log-out" size={18} color={colors.red400} />
          <Text style={[styles.itemText, { color: colors.red400 }]}>{t('common', 'logout')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 8 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: whiteAlpha(0.08),
    marginBottom: 12,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Same logo + "JDK MEA" wordmark pairing as the drawer screens' own
  // native header (see navigation/HeaderTitle.tsx) -- kept in sync here
  // rather than reusing that component directly, since HeaderTitle's
  // onPress navigates via useNavigation() assuming it's mounted under
  // the Drawer Navigator's header slot, not the drawer content itself.
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
  closeBtn: { padding: 4 },
  username: { fontFamily: fonts.sansMedium, fontSize: 13, color: whiteAlpha(0.6) },
  items: { paddingHorizontal: 12, gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
  itemActive: { backgroundColor: 'rgba(212,175,106,0.12)' },
  itemText: { fontFamily: fonts.sansMedium, fontSize: 14, color: whiteAlpha(0.75) },
  itemTextActive: { color: colors.gold400 },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: whiteAlpha(0.08),
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
