import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../components/Alert';
import { GlassCard } from '../components/GlassCard';
import { PageHeader } from '../components/PageHeader';
import { TextField } from '../components/TextField';
import { colors, fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { formatCurrency } from '../utils/format';
import { listProducts, Product } from '../api/catalog';

// Read-only -- this app's sales role has Products read access only (no
// write), so there's no create/edit/delete here, just a searchable
// browse of what's sellable. Mirrors the web app's Products list
// columns that actually matter to Sales (code/name/category/unit/price/
// status), leaving the production-facing fields (BOM/machine/workers)
// off since they're not this screen's audience.
//
// Each row's "Start Quotation" icon is this screen's tie-in to the rest
// of the app: Product/Clients/Quotations/Orders shouldn't be four
// unrelated silos -- seeing a product should let Sales run a
// feasibility check and carry it through to a quotation right away,
// same as the web app's own Feasibility -> Quotation -> Order pipeline.
export function ProductCatalogScreen() {
  const { t } = useLocale();
  const navigation = useNavigation<any>();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProducts({ search: searchTerm ?? undefined });
      setProducts(res.items);
    } catch (err: any) {
      setError(err?.message ?? t('productCatalog', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(search);
    }, [load]),
  );

  function startQuotation(productId: number) {
    navigation.navigate('Quotations', { screen: 'NewQuotation', params: { productId } });
  }

  return (
    <View style={styles.screen}>
      <PageHeader title={t('productCatalog', 'title')} />

      <View style={styles.searchWrap}>
        <TextField
          label={t('productCatalog', 'searchLabel')}
          value={search}
          onChangeText={setSearch}
          placeholder={t('productCatalog', 'searchPlaceholder')}
          onSubmitEditing={() => load(search)}
          returnKeyType="search"
        />
      </View>

      <Alert variant="error">{error}</Alert>

      <FlatList
        data={products}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(search)} tintColor={colors.gold400} />}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>{t('productCatalog', 'emptyText')}</Text> : null}
        renderItem={({ item }) => (
          <GlassCard style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {item.code}
                {item.category ? ` · ${item.category}` : ''} · {item.unit}
              </Text>
              {item.status === 'inactive' && (
                <View style={[styles.statusBadge, styles.badgeInactive, { marginTop: 6 }]}>
                  <Text style={[styles.statusText, styles.badgeInactiveText]}>{t('productCatalog', 'statusInactive')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.rowPrice}>{formatCurrency(item.selling_price)}</Text>
            <Pressable onPress={() => startQuotation(item.id)} hitSlop={10} style={styles.quoteBtn}>
              <Feather name="send" size={16} color={colors.gold400} />
            </Pressable>
          </GlassCard>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18 },
  searchWrap: { marginBottom: 12 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 16, gap: 12 },
  rowName: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.white, marginBottom: 3 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  rowPrice: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.gold300 },
  quoteBtn: { marginLeft: 12, padding: 4 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeInactive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  badgeInactiveText: { color: whiteAlpha(0.5) },
});
