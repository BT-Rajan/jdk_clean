import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

// Rows of 2 -- each row gets flex: 1 so the whole grid stretches to fill
// whatever vertical space is left under the image scroller, instead of
// a handful of fixed-size tiles clustering near the top of the screen.
const TILE_ROWS: Tile[][] = [];
for (let i = 0; i < TILES.length; i += 2) TILE_ROWS.push(TILES.slice(i, i + 2));

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imageScrollContent}
        style={styles.imageScroll}
      >
        <ProductImagePlaceholder label={t('home', 'productImagePlaceholder')} />
        <ProductImagePlaceholder label={t('home', 'productImagePlaceholder')} />
      </ScrollView>

      <View style={styles.grid}>
        {TILE_ROWS.map((row, i) => (
          <View key={i} style={styles.gridRow}>
            {row.map((tile) => (
              <Pressable key={tile.key} onPress={() => handlePress(tile)} style={styles.tile}>
                <View style={styles.iconWrap}>
                  <Feather name={tile.icon} size={26} color={colors.gold400} />
                </View>
                <Text style={styles.tileLabel}>{t('home', tile.labelKey)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function ProductImagePlaceholder({ label }: { label: string }) {
  return (
    <View style={styles.imageCard}>
      <Feather name="image" size={30} color={whiteAlpha(0.35)} />
      <Text style={styles.imageCardLabel}>{label}</Text>
    </View>
  );
}

const IMAGE_CARD_WIDTH = 220;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18 },
  imageScroll: { flexGrow: 0 },
  imageScrollContent: { gap: 14, paddingBottom: 4 },
  imageCard: {
    width: IMAGE_CARD_WIDTH,
    height: 130,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...glass.panel,
  },
  imageCardLabel: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.4) },
  grid: { flex: 1, marginTop: 18, gap: 14 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 14 },
  tile: {
    flex: 1,
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
