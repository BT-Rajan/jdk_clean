import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusTransitionButtons } from '../../components/StatusTransitionButtons';
import { colors, fonts, whiteAlpha } from '../../theme';
import { useLocale } from '../../i18n/LocaleContext';
import { confirm } from '../../utils/alerts';
import { formatCurrency } from '../../utils/format';
import {
  getOrder,
  updateOrderStatus,
  deleteOrder,
  downloadOrderPdf,
  Order,
  OrderStatus,
  ORDER_TRANSITIONS,
  ORDER_STATUSES_REQUIRING_REASON,
} from '../../api/orders';
import { OrdersStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<OrdersStackParamList, 'OrderDetail'>;

type LocaleT = ReturnType<typeof useLocale>['t'];
function statusLabel(t: LocaleT, status: OrderStatus): string {
  return t('orderStatus', status);
}

export function OrderDetailScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { orderId } = route.params;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const o = await getOrder(orderId);
      setOrder(o);
    } catch (err: any) {
      setError(err?.message ?? t('orderDetail', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleDelete() {
    if (!order) return;
    const proceed = await confirm(
      t('orderDetail', 'deleteConfirmTitle'),
      t('orderDetail', 'deleteConfirmMessage', { number: order.order_number }),
      t('common', 'delete'),
      t('common', 'cancel'),
      { destructive: true },
    );
    if (!proceed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteOrder(order.id);
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message ?? t('orderDetail', 'deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleStatusChange(status: any, reason?: string) {
    if (!order) return;
    setStatusBusy(true);
    setError(null);
    try {
      const updated = await updateOrderStatus(order.id, status, reason);
      setOrder(updated);
    } catch (err: any) {
      setError(err?.message ?? t('orderDetail', 'saveError'));
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDownloadPdf() {
    if (!order) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadOrderPdf(order.id, order.order_number);
    } catch (err: any) {
      setError(err?.message ?? t('orderDetail', 'downloadPdfError'));
    } finally {
      setDownloading(false);
    }
  }

  if (loading && !order) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loadingText}>{t('common', 'loading')}</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.screen}>
        <Alert variant="error">{error}</Alert>
      </View>
    );
  }

  const nextStatuses = ORDER_TRANSITIONS[order.status];
  const isDraft = order.status === 'draft';

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <GlassCard strong style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{order.order_number}</Text>
            <Text style={styles.subtitle}>{order.customer_name ?? '—'}</Text>
          </View>
          <StatusBadge status={order.status} label={statusLabel(t, order.status)} />
          {isDraft && (
            <Pressable onPress={() => navigation.navigate('OrderForm', { orderId: order.id })} hitSlop={10} style={styles.headerIconBtn}>
              <Feather name="edit-2" size={18} color={whiteAlpha(0.7)} />
            </Pressable>
          )}
        </View>

        <Alert variant="error">{error}</Alert>

        <View style={styles.metaBox}>
          <MetaRow label={t('orderDetail', 'orderDateLabel')} value={order.order_date} />
          <MetaRow label={t('orderDetail', 'deliveryDateLabel')} value={order.requested_delivery_date ?? '—'} />
          {order.parent_order_number && (
            <MetaRow label={t('orderDetail', 'parentOrderLabel')} value={order.parent_order_number} />
          )}
          {order.close_reason && <MetaRow label={t('orderDetail', 'closeReasonLabel')} value={order.close_reason} />}
        </View>

        <Text style={styles.sectionTitle}>{t('orderDetail', 'linesTitle')}</Text>
        <View style={{ gap: 8 }}>
          {order.lines.map((line) => (
            <View key={line.id} style={styles.lineViewRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{line.product_name ?? `#${line.product_id}`}</Text>
                <Text style={styles.lineMeta}>
                  {line.quantity} {line.unit ?? ''} × {formatCurrency(line.unit_price)}
                  {line.discount_percent ? ` · -${line.discount_percent}%` : ''}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{formatCurrency(line.line_total)}</Text>
            </View>
          ))}

          <View style={styles.totalsBox}>
            <MetaRow label={t('orderDetail', 'subtotalLabel')} value={formatCurrency(order.subtotal_amount)} />
            {order.discount_amount > 0 && (
              <MetaRow label={t('orderDetail', 'discountAmountLabel')} value={`-${formatCurrency(order.discount_amount)}`} />
            )}
            <MetaRow label={t('orderDetail', 'totalLabel')} value={formatCurrency(order.total_amount)} bold />
          </View>

          {order.notes ? (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.sectionTitle}>{t('orderDetail', 'notesLabel')}</Text>
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          ) : null}
        </View>

        {order.child_orders.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>{t('orderDetail', 'childOrdersTitle')}</Text>
            {order.child_orders.map((child) => (
              <Pressable key={child.id} onPress={() => navigation.push('OrderDetail', { orderId: child.id })}>
                <View style={styles.childRow}>
                  <Text style={styles.lineName}>{child.order_number}</Text>
                  <Text style={styles.lineTotal}>{formatCurrency(child.total_amount)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {nextStatuses.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>{t('orderDetail', 'statusActionsTitle')}</Text>
            <StatusTransitionButtons
              nextStatuses={nextStatuses}
              reasonRequiredFor={ORDER_STATUSES_REQUIRING_REASON}
              reasonLabel={t('orderDetail', 'reasonLabel')}
              reasonRequiredError={t('orderDetail', 'reasonRequiredError')}
              cancelLabel={t('common', 'cancel')}
              confirmLabel={t('common', 'confirm')}
              statusLabel={(s) => statusLabel(t, s as OrderStatus)}
              busy={statusBusy}
              onChange={handleStatusChange}
            />
          </View>
        )}

        <Button onPress={handleDownloadPdf} isLoading={downloading} variant="ghost" style={{ marginTop: 16, width: '100%' }}>
          {t('orderDetail', 'downloadPdf')}
        </Button>

        <Button variant="danger" onPress={handleDelete} isLoading={deleting} style={{ marginTop: 12, width: '100%' }}>
          {t('orderDetail', 'deleteOrder')}
        </Button>
      </GlassCard>
    </ScrollView>
  );
}

function MetaRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, bold && { fontFamily: fonts.sansSemibold, fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  loadingText: { fontFamily: fonts.sans, color: whiteAlpha(0.5), textAlign: 'center', marginTop: 40 },
  card: { padding: 22 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  headerIconBtn: { padding: 4 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.white },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.5), marginTop: 2 },

  metaBox: { backgroundColor: whiteAlpha(0.04), borderRadius: 12, padding: 14, gap: 4, marginBottom: 18 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  metaLabel: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  metaValue: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.white },

  sectionTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginBottom: 10 },

  lineViewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: whiteAlpha(0.06) },
  lineName: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.white },
  lineMeta: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45), marginTop: 2 },
  lineTotal: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.gold300 },

  totalsBox: { marginTop: 10, backgroundColor: whiteAlpha(0.04), borderRadius: 12, padding: 14, gap: 4 },
  notesText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.7), lineHeight: 19 },

  childRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: whiteAlpha(0.06),
  },
});
