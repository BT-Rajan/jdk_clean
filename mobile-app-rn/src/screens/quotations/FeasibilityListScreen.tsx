import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../../components/Alert';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { SelectField, SelectOption } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { colors, fonts, whiteAlpha } from '../../theme';
import { useLocale } from '../../i18n/LocaleContext';
import { formatDate } from '../../utils/format';
import { usePagedList } from '../../hooks/usePagedList';
import { listFeasibilities, Feasibility, FeasibilityStatus } from '../../api/feasibility';
import { listCustomers } from '../../api/customers';
import { QuotationsStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<QuotationsStackParamList, 'FeasibilityList'>;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  feasible: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  converted: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  exception_rejected: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
  expired: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
  exception_pending: { bg: 'rgba(245,158,11,0.15)', text: '#fcd34d' },
};
const DEFAULT_STATUS_STYLE = { bg: 'rgba(255,255,255,0.08)', text: whiteAlpha(0.6) };

// Every status a feasibility check can actually be in, for the filter dropdown.
const FEASIBILITY_STATUS_VALUES: FeasibilityStatus[] = [
  'draft',
  'feasible',
  'exception_pending',
  'exception_approved',
  'exception_rejected',
  'closed',
  'converted',
  'expired',
];

const fetchFeasibilities = (params: { page: number; page_size: number; search?: string; status?: string; customer_id?: number }) =>
  listFeasibilities(params);

// Read-only, same reasoning as FeasibilityDetailScreen -- there's no "new
// feasibility" flow here, only a filterable index of checks already run
// (from anywhere, or scoped to one client via a Client Details button).
export function FeasibilityListScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { customerId, customerName } = route.params ?? {};
  const [clientOptions, setClientOptions] = useState<SelectOption[]>([]);

  const {
    items: feasibilities,
    search,
    setSearch,
    status,
    setStatus,
    customerId: selectedCustomerId,
    setCustomerId,
    loading,
    loadingMore,
    error,
    stale,
    refresh,
    loadMore,
  } = usePagedList<Feasibility>(
    useCallback(fetchFeasibilities, []),
    (err) => err?.message ?? t('feasibilityList', 'loadError'),
    customerId ? undefined : 'feasibility',
    customerId,
  );

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: customerName ? `${t('feasibilityList', 'title')} · ${customerName}` : t('feasibilityList', 'title') });
      refresh();
    }, [refresh, navigation, customerName, t]),
  );

  useEffect(() => {
    listCustomers({ page_size: 200 })
      .then((res) => {
        const options = res.items.map((c) => ({ label: c.name, value: String(c.id) }));
        if (customerId && !options.some((o) => o.value === String(customerId))) {
          options.unshift({ label: customerName ?? String(customerId), value: String(customerId) });
        }
        setClientOptions(options);
      })
      .catch(() => {});
  }, [customerId, customerName]);

  const statusOptions = [
    { label: t('feasibilityList', 'statusFilterAll'), value: '' },
    ...FEASIBILITY_STATUS_VALUES.map((s) => ({ label: t('feasibilityStatus', s), value: s })),
  ];

  const clientFilterOptions = [{ label: t('feasibilityList', 'clientFilterAll'), value: '' }, ...clientOptions];

  return (
    <View style={styles.screen}>
      <PageHeader title={customerName ? `${t('feasibilityList', 'title')} · ${customerName}` : t('feasibilityList', 'title')} />

      <View style={styles.filterRow}>
        <View style={{ flex: 2 }}>
          <TextField
            label={t('feasibilityList', 'searchLabel')}
            value={search}
            onChangeText={setSearch}
            placeholder={t('feasibilityList', 'searchPlaceholder')}
            onSubmitEditing={refresh}
            returnKeyType="search"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField
            label={t('feasibilityList', 'statusFilterLabel')}
            value={status}
            onChange={setStatus}
            options={statusOptions}
            searchable={false}
          />
        </View>
      </View>

      <View style={styles.filterRow}>
        <SelectField
          label={t('feasibilityList', 'clientFilterLabel')}
          value={selectedCustomerId ? String(selectedCustomerId) : ''}
          onChange={(v) => setCustomerId(v ? Number(v) : undefined)}
          options={clientFilterOptions}
        />
      </View>

      <Alert variant="error">{error}</Alert>
      {stale && !error && <Text style={styles.staleText}>{t('common', 'staleDataNotice')}</Text>}

      <FlatList
        data={feasibilities}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.gold400} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>{t('feasibilityList', 'emptyText')}</Text> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.gold400} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item }) => {
          const statusStyle = STATUS_STYLES[item.status] ?? DEFAULT_STATUS_STYLE;
          return (
            <Pressable
              onPress={() => navigation.navigate('FeasibilityDetail', { feasibilityId: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`${item.feasibility_number}, ${item.customer_name ?? ''}, ${t('feasibilityStatus', item.status)}`}
            >
              <GlassCard style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowNumber}>{item.feasibility_number}</Text>
                  <Text style={styles.rowMeta}>
                    {item.customer_name ?? '—'} · {formatDate(item.created_at)}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusText, { color: statusStyle.text }]}>{t('feasibilityStatus', item.status)}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={whiteAlpha(0.3)} style={{ marginLeft: 8 }} />
              </GlassCard>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18 },
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  staleText: { fontFamily: fonts.sans, fontSize: 12, color: '#fcd34d', marginBottom: 10 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 16 },
  rowNumber: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.white, marginBottom: 3 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
});
