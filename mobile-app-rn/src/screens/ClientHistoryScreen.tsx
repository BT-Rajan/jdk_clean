import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { GlassCard } from '../components/GlassCard';
import { colors, fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { formatCurrency, formatDate } from '../utils/format';
import { listFeasibilities, Feasibility, FeasibilityStatus } from '../api/feasibility';
import { listQuotations, Quotation, QuotationStatus } from '../api/quotations';
import { listOrders, Order, OrderStatus } from '../api/orders';
import { ClientsStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<ClientsStackParamList, 'ClientHistory'>;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  feasible: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  accepted: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  converted: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  delivered: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  shipped: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  rejected: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
  expired: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
  exception_rejected: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
  cancelled: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
  exception_pending: { bg: 'rgba(245,158,11,0.15)', text: '#fcd34d' },
};
const DEFAULT_STATUS_STYLE = { bg: 'rgba(255,255,255,0.08)', text: whiteAlpha(0.6) };

function statusStyleFor(status: string) {
  return STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE;
}

type LocaleT = ReturnType<typeof useLocale>['t'];

// This screen is the customer's activity hub -- mirrors the web app's
// CustomerDetailPage recent-activity sections (feasibility checks,
// quotations, orders), so Product/Clients/Quotations/Orders read as one
// connected story for a given client instead of four separate silos.
// Reached by tapping a client row on ClientsListScreen.
export function ClientHistoryScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { customerId, customerName } = route.params;

  const [feasibilities, setFeasibilities] = useState<Feasibility[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, q, o] = await Promise.all([
        listFeasibilities({ customer_id: customerId, page_size: 10 }),
        listQuotations({ customer_id: customerId, page_size: 10 }),
        listOrders({ customer_id: customerId, page_size: 10 }),
      ]);
      setFeasibilities(f.items);
      setQuotations(q.items);
      setOrders(o.items);
    } catch (err: any) {
      setError(err?.message ?? t('clientHistory', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: customerName || t('clientHistory', 'title') });
      load();
    }, [load, navigation, customerName]),
  );

  function goToNewQuotation() {
    (navigation.getParent() as any)?.navigate('Quotations', { screen: 'NewQuotation', params: { customerId } });
  }

  function goToFeasibility(feasibilityId: number) {
    (navigation.getParent() as any)?.navigate('Quotations', { screen: 'FeasibilityDetail', params: { feasibilityId } });
  }

  function goToQuotation(quotationId: number) {
    (navigation.getParent() as any)?.navigate('Quotations', { screen: 'QuotationDetail', params: { quotationId } });
  }

  function goToOrder(orderId: number) {
    (navigation.getParent() as any)?.navigate('Orders', { screen: 'OrderDetail', params: { orderId } });
  }

  const nothingYet = !loading && feasibilities.length === 0 && quotations.length === 0 && orders.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{customerName}</Text>
          <Text style={styles.headerSubtitle}>{t('clientHistory', 'subtitle')}</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <Button size="sm" onPress={goToNewQuotation} style={{ flex: 1 }}>
          {t('clientHistory', 'newQuotation')}
        </Button>
      </View>

      <Alert variant="error">{error}</Alert>

      {nothingYet && <Text style={styles.emptyText}>{t('clientHistory', 'emptyText')}</Text>}

      <ActivitySection title={t('clientHistory', 'feasibilitySectionTitle')} count={feasibilities.length}>
        {feasibilities.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => goToFeasibility(f.id)}
            accessibilityRole="button"
            accessibilityLabel={`${f.feasibility_number}, ${t('feasibilityStatus', f.status as FeasibilityStatus)}`}
          >
            <ActivityRow
              primary={f.feasibility_number}
              secondary={formatDate(f.created_at)}
              status={f.status}
              statusLabel={t('feasibilityStatus', f.status as FeasibilityStatus)}
            />
          </Pressable>
        ))}
      </ActivitySection>

      <ActivitySection title={t('clientHistory', 'quotationSectionTitle')} count={quotations.length}>
        {quotations.map((q) => (
          <Pressable
            key={q.id}
            onPress={() => goToQuotation(q.id)}
            accessibilityRole="button"
            accessibilityLabel={`${q.quotation_number}, ${formatCurrency(q.total_amount)}, ${t('quotationStatus', q.status as QuotationStatus)}`}
          >
            <ActivityRow
              primary={q.quotation_number}
              secondary={formatCurrency(q.total_amount)}
              status={q.status}
              statusLabel={t('quotationStatus', q.status as QuotationStatus)}
            />
          </Pressable>
        ))}
      </ActivitySection>

      <ActivitySection title={t('clientHistory', 'orderSectionTitle')} count={orders.length}>
        {orders.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => goToOrder(o.id)}
            accessibilityRole="button"
            accessibilityLabel={`${o.order_number}, ${formatCurrency(o.total_amount)}, ${t('orderStatus', o.status as OrderStatus)}`}
          >
            <ActivityRow
              primary={o.order_number}
              secondary={formatCurrency(o.total_amount)}
              status={o.status}
              statusLabel={t('orderStatus', o.status as OrderStatus)}
            />
          </Pressable>
        ))}
      </ActivitySection>
    </ScrollView>
  );
}

function ActivitySection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title} <Text style={styles.sectionCount}>({count})</Text>
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function ActivityRow({
  primary,
  secondary,
  status,
  statusLabel,
}: {
  primary: string;
  secondary: string;
  status: string;
  statusLabel: string;
}) {
  const statusStyle = statusStyleFor(status);
  return (
    <GlassCard style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowNumber}>{primary}</Text>
        <Text style={styles.rowMeta}>{secondary}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
        <Text style={[styles.statusText, { color: statusStyle.text }]}>{statusLabel}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={whiteAlpha(0.3)} style={{ marginLeft: 8 }} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  headerRow: { marginBottom: 14 },
  headerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.white },
  headerSubtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.45), marginTop: 2 },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), textAlign: 'center', marginTop: 30 },
  section: { marginBottom: 22 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginBottom: 10 },
  sectionCount: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4) },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  rowNumber: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.white, marginBottom: 2 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
});
