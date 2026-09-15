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
  getOrderJourney,
  updateOrderStatus,
  deleteOrder,
  downloadOrderPdf,
  Order,
  OrderJourney,
  OrderStatus,
  ORDER_TRANSITIONS,
  ORDER_STATUSES_REQUIRING_REASON,
} from '../../api/orders';
import { listDeliveryNotes, DeliveryNote, DELIVERY_NOTE_ELIGIBLE_ORDER_STATUSES } from '../../api/deliveryNotes';
import { FeasibilityStatus } from '../../api/feasibility';
import { QuotationStatus } from '../../api/quotations';
import { OrdersStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<OrdersStackParamList, 'OrderDetail'>;

type LocaleT = ReturnType<typeof useLocale>['t'];
function statusLabel(t: LocaleT, status: OrderStatus): string {
  return t('orderStatus', status);
}

const FEASIBILITY_STATUS_KEYS = [
  'draft',
  'feasible',
  'exception_pending',
  'exception_approved',
  'exception_rejected',
  'closed',
  'converted',
  'expired',
];
const QUOTATION_STATUS_KEYS = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'];

function journeyFeasibilityLabel(t: LocaleT, status: string): string {
  return FEASIBILITY_STATUS_KEYS.includes(status) ? t('feasibilityStatus', status as FeasibilityStatus) : status;
}
function journeyQuotationLabel(t: LocaleT, status: string): string {
  return QUOTATION_STATUS_KEYS.includes(status) ? t('quotationStatus', status as QuotationStatus) : status;
}

export function OrderDetailScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { orderId } = route.params;

  const [order, setOrder] = useState<Order | null>(null);
  const [journey, setJourney] = useState<OrderJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  // An order can be shipped across more than one delivery note (multiple
  // trucks/dates) -- see backend delivery_note_service.py's
  // ELIGIBLE_ORDER_STATUSES -- so this tracks every note issued against
  // it, not just a single "the" note.
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const o = await getOrder(orderId);
      setOrder(o);
      // Best-effort -- the journey trace is a nice-to-have (ties this
      // order back to the feasibility check/quotation it came from, if
      // any), not something that should block the rest of the page.
      getOrderJourney(orderId).then(setJourney).catch(() => setJourney(null));
      listDeliveryNotes({ order_id: orderId, page_size: 50 })
        .then((res) => setDeliveryNotes(res.items))
        .catch(() => setDeliveryNotes([]));
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

  function goToCustomer() {
    if (!order) return;
    (navigation.getParent() as any)?.navigate('Clients', {
      screen: 'ClientHistory',
      params: { customerId: order.customer_id, customerName: order.customer_name ?? '' },
    });
  }

  function goToFeasibility() {
    if (!journey?.feasibility) return;
    (navigation.getParent() as any)?.navigate('Quotations', {
      screen: 'FeasibilityDetail',
      params: { feasibilityId: journey.feasibility.id },
    });
  }

  function goToQuotation() {
    if (!journey?.quotation) return;
    (navigation.getParent() as any)?.navigate('Quotations', {
      screen: 'QuotationDetail',
      params: { quotationId: journey.quotation.id },
    });
  }

  function goToCreateDeliveryNote() {
    if (!order) return;
    navigation.navigate('DeliveryNoteForm', { orderId: order.id, orderNumber: order.order_number });
  }

  function goToDeliveryNote(deliveryNoteId: number) {
    navigation.navigate('DeliveryNoteDetail', { deliveryNoteId });
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
            <Pressable onPress={goToCustomer} hitSlop={6}>
              <Text style={[styles.subtitle, styles.linkText]}>{order.customer_name ?? '—'}</Text>
            </Pressable>
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

        {journey && (journey.feasibility || journey.quotation) && (
          <View style={{ marginBottom: 18 }}>
            <Text style={styles.sectionTitle}>{t('orderDetail', 'journeyTitle')}</Text>
            {journey.feasibility && (
              <Pressable onPress={goToFeasibility} style={styles.linkRow}>
                <Feather name="check-circle" size={14} color={colors.gold300} />
                <Text style={styles.linkRowText}>
                  {journey.feasibility.feasibility_number} · {journeyFeasibilityLabel(t, journey.feasibility.status)}
                </Text>
                <Feather name="chevron-right" size={14} color={whiteAlpha(0.3)} style={{ marginLeft: 'auto' }} />
              </Pressable>
            )}
            {journey.quotation && (
              <Pressable onPress={goToQuotation} style={styles.linkRow}>
                <Feather name="file-text" size={14} color={colors.gold300} />
                <Text style={styles.linkRowText}>
                  {journey.quotation.quotation_number} · {journeyQuotationLabel(t, journey.quotation.status)}
                </Text>
                <Feather name="chevron-right" size={14} color={whiteAlpha(0.3)} style={{ marginLeft: 'auto' }} />
              </Pressable>
            )}
          </View>
        )}

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

        {(deliveryNotes.length > 0 ||
          (DELIVERY_NOTE_ELIGIBLE_ORDER_STATUSES as readonly string[]).includes(order.status)) && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>{t('orderDetail', 'deliveryNotesTitle')}</Text>
            {deliveryNotes.map((n) => (
              <Pressable key={n.id} onPress={() => goToDeliveryNote(n.id)} style={styles.linkRow}>
                <Feather name="truck" size={14} color={colors.gold300} />
                <Text style={styles.linkRowText}>
                  {n.delivery_note_number} · {n.delivery_date}
                </Text>
                <Feather name="chevron-right" size={14} color={whiteAlpha(0.3)} style={{ marginLeft: 'auto' }} />
              </Pressable>
            ))}
            {(DELIVERY_NOTE_ELIGIBLE_ORDER_STATUSES as readonly string[]).includes(order.status) && (
              <Button onPress={goToCreateDeliveryNote} variant="ghost" style={{ marginTop: 4, width: '100%' }}>
                {t('orderDetail', 'createDeliveryNote')}
              </Button>
            )}
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
  linkText: { color: colors.gold300 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: whiteAlpha(0.04),
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  linkRowText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.gold300 },

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
