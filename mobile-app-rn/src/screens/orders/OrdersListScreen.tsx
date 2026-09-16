import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../../components/Alert';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { colors, fonts, whiteAlpha } from '../../theme';
import { useLocale } from '../../i18n/LocaleContext';
import { confirm } from '../../utils/alerts';
import { formatCurrency, formatDate } from '../../utils/format';
import { usePagedList } from '../../hooks/usePagedList';
import { listOrders, deleteOrder, Order, OrderStatus, ORDER_TRANSITIONS } from '../../api/orders';
import { OrdersStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<OrdersStackParamList, 'OrdersList'>;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  delivered: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  shipped: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  ready_to_ship: { bg: 'rgba(56,189,248,0.15)', text: colors.sky400 },
  in_production: { bg: 'rgba(56,189,248,0.15)', text: colors.sky400 },
  cancelled: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
};
const DEFAULT_STATUS_STYLE = { bg: 'rgba(255,255,255,0.08)', text: whiteAlpha(0.6) };

// Every status an order can actually be in -- ORDER_TRANSITIONS' own keys
// (draft plus every settable status) -- for the filter dropdown.
const ORDER_STATUS_VALUES = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];

const fetchOrders = (params: { page: number; page_size: number; search?: string; status?: string }) =>
  listOrders(params);

export function OrdersListScreen({ navigation }: Props) {
  const { t } = useLocale();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const {
    items: orders,
    setItems,
    search,
    setSearch,
    status,
    setStatus,
    loading,
    loadingMore,
    error,
    setError,
    refresh,
    loadMore,
  } = usePagedList<Order>(useCallback(fetchOrders, []), (err) => err?.message ?? t('ordersList', 'loadError'));

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const statusOptions = [
    { label: t('ordersList', 'statusFilterAll'), value: '' },
    ...ORDER_STATUS_VALUES.map((s) => ({ label: t('orderStatus', s), value: s })),
  ];

  // An order can only be created from an accepted quotation (which
  // itself requires a feasibility check) -- see order_service.
  // create_order -- so this starts that flow instead of a since-removed
  // direct "new order" screen.
  function goToNewQuotation() {
    (navigation.getParent() as any)?.navigate('Quotations', { screen: 'NewQuotation' });
  }

  async function handleDelete(order: Order) {
    const proceed = await confirm(
      t('ordersList', 'deleteConfirmTitle'),
      t('ordersList', 'deleteConfirmMessage', { number: order.order_number }),
      t('common', 'delete'),
      t('common', 'cancel'),
      { destructive: true },
    );
    if (!proceed) return;
    setDeletingId(order.id);
    setError(null);
    try {
      await deleteOrder(order.id);
      setItems((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err: any) {
      setError(err?.message ?? t('ordersList', 'deleteError'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <PageHeader
        title={t('ordersList', 'title')}
        action={
          <Pressable onPress={goToNewQuotation} hitSlop={10} style={styles.newBtn}>
            <Feather name="plus-circle" size={24} color={colors.gold400} />
          </Pressable>
        }
      />

      <View style={styles.filterRow}>
        <View style={{ flex: 2 }}>
          <TextField
            label={t('ordersList', 'searchLabel')}
            value={search}
            onChangeText={setSearch}
            placeholder={t('ordersList', 'searchPlaceholder')}
            onSubmitEditing={refresh}
            returnKeyType="search"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField
            label={t('ordersList', 'statusFilterLabel')}
            value={status}
            onChange={setStatus}
            options={statusOptions}
            searchable={false}
          />
        </View>
      </View>

      <Alert variant="error">{error}</Alert>

      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.gold400} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>{t('ordersList', 'emptyText')}</Text> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.gold400} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item }) => {
          const statusStyle = STATUS_STYLES[item.status] ?? DEFAULT_STATUS_STYLE;
          const isDraft = item.status === 'draft';
          return (
            <Pressable onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}>
              <GlassCard style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowNumber}>{item.order_number}</Text>
                  <Text style={styles.rowMeta}>
                    {item.customer_name ?? '—'} · {formatDate(item.order_date)}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={styles.rowTotal}>{formatCurrency(item.total_amount)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
                      {t('orderStatus', item.status as OrderStatus)}
                    </Text>
                  </View>
                </View>

                {isDraft && (
                  <Pressable
                    onPress={() => navigation.navigate('OrderForm', { orderId: item.id })}
                    hitSlop={10}
                    style={styles.iconBtn}
                  >
                    <Feather name="edit-2" size={16} color={whiteAlpha(0.7)} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                  hitSlop={10}
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
  newBtn: { padding: 2 },
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 16 },
  rowNumber: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.white, marginBottom: 3 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  rowTotal: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.gold300 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  iconBtn: { marginLeft: 14, padding: 4 },
});
