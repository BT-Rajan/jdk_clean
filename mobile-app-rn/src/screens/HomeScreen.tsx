import { Alert as RNAlert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useLocale } from '../i18n/LocaleContext';
import { colors, fonts, glass, radii, whiteAlpha } from '../theme';

interface Tile {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  labelKey: 'quickQuote' | 'clients' | 'poUpload' | 'sendNotification' | 'productCatalog' | 'comingSoon';
  route?: string; // real, wired destination -- omitted for not-yet-built tiles
}

const TILES: Tile[] = [
  { key: 'quickQuote', icon: 'file-text', labelKey: 'quickQuote', route: 'Enquiry' },
  { key: 'clients', icon: 'users', labelKey: 'clients', route: 'Clients' },
  { key: 'poUpload', icon: 'upload', labelKey: 'poUpload' },
  { key: 'sendNotification', icon: 'bell', labelKey: 'sendNotification' },
  { key: 'productCatalog', icon: 'box', labelKey: 'productCatalog' },
  { key: 'comingSoon', icon: 'clock', labelKey: 'comingSoon' },
];

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLocale();

  function handlePress(tile: Tile) {
    if (tile.route) {
      navigation.navigate(tile.route);
    } else {
      // Not built yet -- visible on the home screen (matches the design
      // reference) but genuinely nothing behind it, so it just says so
      // rather than pretending to navigate somewhere.
      RNAlert.alert(t('home', tile.labelKey), t('common', 'comingSoon'));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.grid}>
        {TILES.map((tile) => (
          <Pressable key={tile.key} onPress={() => handlePress(tile)} style={styles.tile}>
            <View style={styles.iconWrap}>
              <Feather name={tile.icon} size={26} color={colors.gold400} />
            </View>
            <Text style={styles.tileLabel}>{t('home', tile.labelKey)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tile: {
    width: '47%',
    aspectRatio: 1.15,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    ...glass.panel,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,106,0.12)',
  },
  tileLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: whiteAlpha(0.85),
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
