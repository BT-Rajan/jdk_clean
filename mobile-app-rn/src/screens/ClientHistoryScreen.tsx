import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { GlassCard } from '../components/GlassCard';
import { StatusBadge } from '../components/StatusBadge';
import { colors, fonts, radii, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { formatCurrency } from '../utils/format';
import { getCustomer, getCustomerCredit, Customer, CustomerCreditStatus } from '../api/customers';
import { listFeasibilities } from '../api/feasibility';
import { listQuotations } from '../api/quotations';
import { listOrders } from '../api/orders';
import { ClientsStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<ClientsStackParamList, 'ClientHistory'>;

// This screen is the client's details + activity hub -- mirrors the web
// app's CustomerDetailPage: the client's own profile fields up top, then
// its recent-activity sections (feasibility checks, quotations, orders)
// below, so Product/Clients/Quotations/Orders read as one connected story
// for a given client instead of four separate silos. Reached by tapping
// a client row on ClientsListScreen.
export function ClientHistoryScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { customerId, customerName } = route.params;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [creditStatus, setCreditStatus] = useState<CustomerCreditStatus | null>(null);
  const [feasibilityCount, setFeasibilityCount] = useState(0);
  const [quotationCount, setQuotationCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // page_size: 1 -- only `.total` from each is needed here; the
      // module buttons below link out to the real, fully paginated lists
      // instead of duplicating them on this screen.
      const [c, f, q, o] = await Promise.all([
        getCustomer(customerId),
        listFeasibilities({ customer_id: customerId, page_size: 1 }),
        listQuotations({ customer_id: customerId, page_size: 1 }),
        listOrders({ customer_id: customerId, page_size: 1 }),
      ]);
      setCustomer(c);
      setFeasibilityCount(f.total);
      setQuotationCount(q.total);
      setOrderCount(o.total);
    } catch (err: any) {
      setError(err?.message ?? t('clientHistory', 'loadError'));
    } finally {
      setLoading(false);
    }
    // Best-effort, same as the web page -- a customer with no credit
    // limit set shouldn't block the rest of this screen from loading.
    getCustomerCredit(customerId)
      .then(setCreditStatus)
      .catch(() => setCreditStatus(null));
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

  function goToFeasibilityList() {
    (navigation.getParent() as any)?.navigate('Quotations', { screen: 'FeasibilityList', params: { customerId, customerName } });
  }

  function goToQuotationsList() {
    (navigation.getParent() as any)?.navigate('Quotations', { screen: 'QuotationsList', params: { customerId, customerName } });
  }

  function goToOrdersList() {
    (navigation.getParent() as any)?.navigate('Orders', { screen: 'OrdersList', params: { customerId, customerName } });
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{customerName}</Text>
          <Text style={styles.headerSubtitle}>{t('clientHistory', 'subtitle')}</Text>
        </View>
        {customer && (
          <StatusBadge
            status={customer.status}
            label={customer.status === 'active' ? t('clientForm', 'statusActive') : t('clientForm', 'statusInactive')}
          />
        )}
      </View>

      {customer && (
        <GlassCard strong style={styles.detailsCard}>
          <View style={styles.detailsGrid}>
            <DetailRow
              label={customer.customer_type === 'individual' ? t('clientForm', 'codeLabelIndividual') : t('clientForm', 'codeLabelBusiness')}
              value={customer.code}
            />
            <DetailRow
              label={t('clientForm', 'typeLabel')}
              value={customer.customer_type === 'individual' ? t('clientForm', 'typeIndividual') : t('clientForm', 'typeBusiness')}
            />
            <DetailRow label={t('clientForm', 'contactPersonLabel')} value={customer.contact_person} />
            <DetailRow label={t('clientForm', 'phoneLabel')} value={customer.phone} />
            <DetailRow label={t('clientForm', 'emailLabel')} value={customer.email} />
            <DetailRow label={t('clientForm', 'cityLabel')} value={customer.city} />
            <DetailRow label={t('clientForm', 'countryLabel')} value={customer.country} />
            <DetailRow label={t('clientForm', 'billingAddressLabel')} value={customer.billing_address} />
            <DetailRow label={t('clientForm', 'shippingAddressLabel')} value={customer.shipping_address} />
            <DetailRow label={t('clientForm', 'creditLimitLabel')} value={formatCurrency(customer.credit_limit)} />
            <DetailRow
              label={t('clientForm', 'paymentTermsLabel')}
              value={t('clientHistory', 'paymentTermsValue', { days: customer.payment_terms_days })}
            />
          </View>
          {creditStatus?.limit_enforced && (
            <View style={styles.creditBox}>
              <DetailRow
                label={t('clientHistory', 'outstandingBalanceLabel')}
                value={formatCurrency(creditStatus.outstanding_balance)}
              />
              <DetailRow
                label={t('clientHistory', 'availableCreditLabel')}
                value={creditStatus.available_credit != null ? formatCurrency(creditStatus.available_credit) : null}
              />
            </View>
          )}
          {customer.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>{t('clientForm', 'notesLabel')}</Text>
              <Text style={styles.notesText}>{customer.notes}</Text>
            </View>
          )}
        </GlassCard>
      )}

      <View style={styles.quickActions}>
        <Button size="sm" onPress={goToNewQuotation} style={{ flex: 1 }}>
          {t('clientHistory', 'newQuotation')}
        </Button>
      </View>

      <Alert variant="error">{error}</Alert>

      <View style={styles.moduleSection}>
        <ModuleButton
          icon="check-square"
          label={t('clientHistory', 'feasibilitySectionTitle')}
          count={feasibilityCount}
          onPress={goToFeasibilityList}
        />
        <ModuleButton
          icon="file-text"
          label={t('clientHistory', 'quotationSectionTitle')}
          count={quotationCount}
          onPress={goToQuotationsList}
        />
        <ModuleButton icon="package" label={t('clientHistory', 'orderSectionTitle')} count={orderCount} onPress={goToOrdersList} />
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '—'}</Text>
    </View>
  );
}

function ModuleButton({
  icon,
  label,
  count,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${count}`}>
      <GlassCard style={styles.moduleRow}>
        <View style={styles.moduleIconWrap}>
          <Feather name={icon} size={20} color={colors.gold400} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.moduleLabel}>{label}</Text>
          <Text style={styles.moduleCount}>{count}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={whiteAlpha(0.3)} />
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  headerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.white },
  headerSubtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.45), marginTop: 2 },
  detailsCard: { padding: 18, marginBottom: 18 },
  detailsGrid: { gap: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 12 },
  detailLabel: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45), flexShrink: 0 },
  detailValue: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.white, flexShrink: 1, textAlign: 'right' },
  creditBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: whiteAlpha(0.08),
    gap: 4,
  },
  notesBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: whiteAlpha(0.08) },
  notesLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: whiteAlpha(0.4),
    marginBottom: 4,
  },
  notesText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.75), lineHeight: 19 },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  moduleSection: { gap: 10 },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  moduleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,106,0.12)',
  },
  moduleLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.white, marginBottom: 2 },
  moduleCount: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
});
