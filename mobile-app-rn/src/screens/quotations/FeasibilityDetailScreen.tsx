import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { StatusBadge } from '../../components/StatusBadge';
import { colors, fonts, whiteAlpha } from '../../theme';
import { useLocale } from '../../i18n/LocaleContext';
import { formatDate, formatDateTime } from '../../utils/format';
import { getFeasibility, Feasibility, FeasibilityStatus } from '../../api/feasibility';
import { getQuotationForFeasibility } from '../../api/quotations';
import { QuotationsStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<QuotationsStackParamList, 'FeasibilityDetail'>;

type LocaleT = ReturnType<typeof useLocale>['t'];
function statusLabel(t: LocaleT, status: FeasibilityStatus): string {
  return t('feasibilityStatus', status);
}

// Read-only: this screen exists so a feasibility check reached from
// anywhere (a Client's activity hub, a Quotation's own detail page, an
// Order's journey section) shows the same shortfall/capacity report the
// web app's Feasibility detail page does -- there's no separate "New
// feasibility" entry point here, that's what starting a New Quotation
// already does (see NewQuotationScreen).
export function FeasibilityDetailScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { feasibilityId } = route.params;

  const [feasibility, setFeasibility] = useState<Feasibility | null>(null);
  const [quotationId, setQuotationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const f = await getFeasibility(feasibilityId);
      setFeasibility(f);
      const quotation = await getQuotationForFeasibility(feasibilityId).catch(() => null);
      setQuotationId(quotation?.id ?? null);
    } catch (err: any) {
      setError(err?.message ?? t('feasibilityDetail', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, [feasibilityId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading && !feasibility) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loadingText}>{t('common', 'loading')}</Text>
      </View>
    );
  }

  if (!feasibility) {
    return (
      <View style={styles.screen}>
        <Alert variant="error">{error}</Alert>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <GlassCard strong style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{feasibility.feasibility_number}</Text>
            <Text style={styles.subtitle}>{feasibility.customer_name ?? '—'}</Text>
          </View>
          <StatusBadge status={feasibility.status} label={statusLabel(t, feasibility.status)} />
        </View>

        <Alert variant="error">{error}</Alert>

        <View style={styles.metaBox}>
          <MetaRow label={t('feasibilityDetail', 'requiredByLabel')} value={formatDate(feasibility.required_by_date)} />
          <MetaRow label={t('feasibilityDetail', 'checkedAtLabel')} value={feasibility.checked_at ? formatDateTime(feasibility.checked_at) : '—'} />
          {feasibility.exception_reason && (
            <MetaRow label={t('feasibilityDetail', 'exceptionReasonLabel')} value={feasibility.exception_reason} />
          )}
          {feasibility.close_reason && (
            <MetaRow label={t('feasibilityDetail', 'closeReasonLabel')} value={feasibility.close_reason} />
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('feasibilityDetail', 'linesTitle')}</Text>
        <View style={{ gap: 10 }}>
          {feasibility.lines.map((line) => (
            <View key={line.id} style={styles.lineCard}>
              <View style={styles.lineHeaderRow}>
                <Text style={styles.lineName}>{line.product_name ?? `#${line.product_id}`}</Text>
                <View
                  style={[
                    styles.lineBadge,
                    line.is_feasible ? styles.lineBadgeOk : styles.lineBadgeBad,
                  ]}
                >
                  <Feather
                    name={line.is_feasible ? 'check' : 'x'}
                    size={12}
                    color={line.is_feasible ? colors.emerald400 : colors.red400}
                  />
                </View>
              </View>
              <Text style={styles.lineMeta}>{t('feasibilityDetail', 'quantityLabel')}: {line.quantity}</Text>
              {line.covered_by_stock ? (
                <Text style={styles.okText}>
                  {t('feasibilityDetail', 'inStockLabel', { quantity: line.covered_by_stock })}
                </Text>
              ) : null}
              {line.bom_missing && <Text style={styles.warnText}>{t('feasibilityDetail', 'bomMissing')}</Text>}
              {line.estimated_ready_date && (
                <Text style={styles.lineMeta}>
                  {t('feasibilityDetail', 'estimatedReadyLabel')}: {formatDate(line.estimated_ready_date)}
                </Text>
              )}
              {line.shortfalls.length > 0 && (
                <View style={{ marginTop: 6, gap: 4 }}>
                  {line.shortfalls.map((s) => (
                    <Text key={s.raw_material_id} style={styles.shortfallText}>
                      {s.name}: {t('feasibilityDetail', 'shortByDetailed', {
                        shortfall: s.shortfall,
                        unit: s.unit,
                        required: s.required,
                        onHand: s.on_hand,
                      })}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {quotationId && (
          <Button
            variant="ghost"
            onPress={() => navigation.navigate('QuotationDetail', { quotationId })}
            style={{ marginTop: 20, width: '100%' }}
          >
            {t('feasibilityDetail', 'viewQuotation')}
          </Button>
        )}
      </GlassCard>
    </ScrollView>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  loadingText: { fontFamily: fonts.sans, color: whiteAlpha(0.5), textAlign: 'center', marginTop: 40 },
  card: { padding: 22 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.white },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.5), marginTop: 2 },

  metaBox: { backgroundColor: whiteAlpha(0.04), borderRadius: 12, padding: 14, gap: 4, marginBottom: 18 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  metaLabel: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  metaValue: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.white },

  sectionTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginBottom: 10 },

  lineCard: { backgroundColor: whiteAlpha(0.04), borderRadius: 12, padding: 14 },
  lineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineName: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.white },
  lineBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lineBadgeOk: { backgroundColor: 'rgba(16,185,129,0.15)' },
  lineBadgeBad: { backgroundColor: 'rgba(239,68,68,0.15)' },
  lineMeta: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.5), marginTop: 4 },
  okText: { fontFamily: fonts.sans, fontSize: 12, color: colors.emerald400, marginTop: 4 },
  warnText: { fontFamily: fonts.sans, fontSize: 12, color: '#fcd34d', marginTop: 4 },
  shortfallText: { fontFamily: fonts.sans, fontSize: 12, color: colors.red400 },
});
