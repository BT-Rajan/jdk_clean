import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { colors, fonts, whiteAlpha } from '../../theme';
import { useLocale } from '../../i18n/LocaleContext';
import { confirm } from '../../utils/alerts';
import { formatCurrency, formatDate } from '../../utils/format';
import { usePagedList } from '../../hooks/usePagedList';
import { listQuotations, deleteQuotation, Quotation, QuotationStatus, QUOTATION_TRANSITIONS } from '../../api/quotations';
import { QuotationsStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<QuotationsStackParamList, 'QuotationsList'>;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  accepted: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  converted: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  rejected: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
  expired: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
};
const DEFAULT_STATUS_STYLE = { bg: 'rgba(255,255,255,0.08)', text: whiteAlpha(0.6) };

// Every status a quotation can actually be in -- QUOTATION_TRANSITIONS'
// own keys (draft plus every settable status) -- for the filter dropdown.
const QUOTATION_STATUS_VALUES = Object.keys(QUOTATION_TRANSITIONS) as QuotationStatus[];

const fetchQuotations = (params: { page: number; page_size: number; search?: string; status?: string }) =>
  listQuotations(params);

export function QuotationsListScreen({ navigation }: Props) {
  const { t } = useLocale();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const {
    items: quotations,
    setItems,
    search,
    setSearch,
    status,
    setStatus,
    loading,
    loadingMore,
    error,
    stale,
    setError,
    refresh,
    loadMore,
  } = usePagedList<Quotation>(
    useCallback(fetchQuotations, []),
    (err) => err?.message ?? t('quotationsList', 'loadError'),
    'quotations',
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const statusOptions = [
    { label: t('quotationsList', 'statusFilterAll'), value: '' },
    ...QUOTATION_STATUS_VALUES.map((s) => ({ label: t('quotationStatus', s), value: s })),
  ];

  async function handleDelete(quotation: Quotation) {
    const proceed = await confirm(
      t('quotationsList', 'deleteConfirmTitle'),
      t('quotationsList', 'deleteConfirmMessage', { number: quotation.quotation_number }),
      t('common', 'delete'),
      t('common', 'cancel'),
      { destructive: true },
    );
    if (!proceed) return;
    setDeletingId(quotation.id);
    setError(null);
    try {
      await deleteQuotation(quotation.id);
      setItems((prev) => prev.filter((q) => q.id !== quotation.id));
    } catch (err: any) {
      setError(err?.message ?? t('quotationsList', 'deleteError'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <PageHeader
        title={t('quotationsList', 'title')}
        action={
          <Button size="sm" onPress={() => navigation.navigate('NewQuotation')}>
            {t('quotationsList', 'newButton')}
          </Button>
        }
      />

      <View style={styles.filterRow}>
        <View style={{ flex: 2 }}>
          <TextField
            label={t('quotationsList', 'searchLabel')}
            value={search}
            onChangeText={setSearch}
            placeholder={t('quotationsList', 'searchPlaceholder')}
            onSubmitEditing={refresh}
            returnKeyType="search"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField
            label={t('quotationsList', 'statusFilterLabel')}
            value={status}
            onChange={setStatus}
            options={statusOptions}
            searchable={false}
          />
        </View>
      </View>

      <Alert variant="error">{error}</Alert>
      {stale && !error && <Text style={styles.staleText}>{t('common', 'staleDataNotice')}</Text>}

      <FlatList
        data={quotations}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.gold400} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>{t('quotationsList', 'emptyText')}</Text> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.gold400} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item }) => {
          const statusStyle = STATUS_STYLES[item.status] ?? DEFAULT_STATUS_STYLE;
          const isDraft = item.status === 'draft';
          return (
            <Pressable
              onPress={() => navigation.navigate('QuotationDetail', { quotationId: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`${item.quotation_number}, ${item.customer_name ?? ''}, ${t('quotationStatus', item.status as QuotationStatus)}`}
            >
              <GlassCard style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowNumber}>{item.quotation_number}</Text>
                  <Text style={styles.rowMeta}>
                    {item.customer_name ?? '—'} · {formatDate(item.quotation_date)}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={styles.rowTotal}>{formatCurrency(item.total_amount)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
                      {t('quotationStatus', item.status as QuotationStatus)}
                    </Text>
                  </View>
                </View>

                {isDraft && (
                  <Pressable
                    onPress={() => navigation.navigate('QuotationDetail', { quotationId: item.id, startInEdit: true })}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('common', 'edit')} ${item.quotation_number}`}
                    style={styles.iconBtn}
                  >
                    <Feather name="edit-2" size={16} color={whiteAlpha(0.7)} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('common', 'delete')} ${item.quotation_number}`}
                  style={styles.iconBtn}
                >
                  <Feather name="trash-2" size={16} color={colors.red400} />
                </Pressable>
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
  rowTotal: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.gold300 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  iconBtn: { marginLeft: 14, padding: 4 },
});
