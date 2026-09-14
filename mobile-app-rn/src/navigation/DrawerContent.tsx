import { DrawerContentComponentProps, DrawerContentScrollView } from '@react-navigation/drawer';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
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
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const activeRoute = props.state.routes[props.state.index]?.name;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink900 }}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Logo size={40} />
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
          should stay reachable without scrolling however long the nav
          list grows. */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
});
