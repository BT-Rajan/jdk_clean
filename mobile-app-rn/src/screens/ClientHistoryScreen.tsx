import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../components/Alert';
import { GlassCard } from '../components/GlassCard';
import { colors, fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { listQuotationsForCustomer, QuotationSummary } from '../api/quotations';
import { ClientsStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<ClientsStackParamList, 'ClientHistory'>;

// Kuwaiti Dinar (KWD) is subdivided into 1,000 fils, so amounts are
// conventionally shown with 3 decimals, not 2 -- mirrors the web app's
// frontend/src/lib/currency.ts formatCurrency().
function formatCurrency(value: number): string {
  return `KWD ${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  accepted: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  converted: { bg: 'rgba(16,185,129,0.15)', text: colors.emerald400 },
  rejected: { bg: 'rgba(239,68,68,0.15)', text: colors.red400 },
};
const DEFAULT_STATUS_STYLE = { bg: 'rgba(255,255,255,0.08)', text: whiteAlpha(0.6) };

// Mirrors backend/app/models/quotation.py's QUOTATION_STATUSES.
const KNOWN_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'] as const;
function isKnownStatus(status: string): status is (typeof KNOWN_STATUSES)[number] {
  return (KNOWN_STATUSES as readonly string[]).includes(status);
}

export function ClientHistoryScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { customerId, customerName } = route.params;

  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listQuotationsForCustomer(customerId);
      setQuotations(res.items);
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

  return (
    <View style={styles.screen}>
      <Text style={styles.headerTitle}>{customerName}</Text>
      <Text style={styles.headerSubtitle}>{t('clientHistory', 'subtitle')}</Text>

      <Alert variant="error">{error}</Alert>

      <FlatList
        data={quotations}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        ListEmptyComponent={
          !loading ? <Text style={styles.emptyText}>{t('clientHistory', 'emptyText')}</Text> : null
        }
        renderItem={({ item }) => {
          const statusStyle = STATUS_STYLES[item.status] ?? DEFAULT_STATUS_STYLE;
          const statusLabel = isKnownStatus(item.status) ? t('quotationStatus', item.status) : item.status;
          return (
            <GlassCard style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowNumber}>{item.quotation_number}</Text>
                <Text style={styles.rowDate}>{item.quotation_date}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={styles.rowTotal}>{formatCurrency(item.total_amount)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusText, { color: statusStyle.text }]}>{statusLabel}</Text>
                </View>
              </View>
            </GlassCard>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18 },
  headerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.white },
  headerSubtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.45), marginBottom: 16 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: 16 },
  rowNumber: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.white, marginBottom: 3 },
  rowDate: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  rowTotal: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.gold300 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
});
