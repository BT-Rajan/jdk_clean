import { useEffect, useState } from 'react';
import { Alert as RNAlert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { DateField } from '../components/DateField';
import { GlassCard } from '../components/GlassCard';
import { SelectField, SelectOption } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { colors, fonts, whiteAlpha } from '../theme';
import { ApiError } from '../api/client';
import { useLocale } from '../i18n/LocaleContext';
import { listCustomers, Customer } from '../api/customers';
import { listProducts, Product, createFeasibility, runFeasibility, requestFeasibilityException, createQuotation } from '../api/catalog';

type ResultState =
  | { kind: 'feasible'; quotationNumber: string; total: number; validUntil: string }
  | { kind: 'not_feasible' }
  | null;

// Deliberately not date.toISOString().slice(0,10) -- that converts to
// UTC first, which can silently roll the date back a day for anyone
// west of UTC in the evening. Building the string from local
// getFullYear/Month/Date keeps it the date the user actually picked.
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function QuickQuoteScreen() {
  const { t } = useLocale();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState<Date | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<ResultState>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([listCustomers({ page_size: 200 }), listProducts()]);
        setCustomers(c.items);
        setProducts(p.items);
      } catch (err: any) {
        setLoadError(err?.message ?? t('quickQuote', 'genericError'));
      }
    })();
  }, []);

  const customerOptions: SelectOption[] = customers.map((c) => ({ label: c.name, value: String(c.id) }));
  const productOptions: SelectOption[] = products.map((p) => ({
    label: p.code ? `${p.name} (${p.code})` : p.name,
    value: String(p.id),
  }));

  function resetForm() {
    setResult(null);
    setCustomerId(null);
    setProductId(null);
    setQuantity('');
    setDate(null);
    setFormError(null);
  }

  async function handleCheck() {
    setFormError(null);
    const qty = parseFloat(quantity);

    if (!customerId) return setFormError(t('quickQuote', 'selectClientError'));
    if (!productId) return setFormError(t('quickQuote', 'selectProductError'));
    if (!qty || qty <= 0) return setFormError(t('quickQuote', 'invalidQuantityError'));
    if (!date) return setFormError(t('quickQuote', 'selectDateError'));

    const dateIso = toIsoDate(date);

    setIsChecking(true);
    try {
      setStatusLine(t('quickQuote', 'runningCheck'));
      const created = await createFeasibility({
        customer_id: Number(customerId),
        required_by_date: dateIso,
        lines: [{ product_id: Number(productId), quantity: qty }],
      });
      const checked = await runFeasibility(created.id);

      if (checked.status === 'feasible') {
        setStatusLine(t('quickQuote', 'generatingQuote'));
        const product = products.find((p) => String(p.id) === productId);
        const unitPrice = product?.selling_price ?? 0;
        const quotationPayload = {
          customer_id: Number(customerId),
          feasibility_id: created.id,
          quotation_date: toIsoDate(new Date()),
          lines: [{ product_id: Number(productId), quantity: qty, unit_price: unitPrice, discount_percent: 0 }],
        };

        let quotation;
        try {
          quotation = await createQuotation(quotationPayload);
        } catch (err) {
          // 409 here specifically means this quotation's material needs
          // overlap another still-open quotation/order -- the backend
          // requires an explicit acknowledgment to proceed anyway (see
          // quotation_service.check_material_conflicts). Any other error
          // just rethrows to the outer catch below as normal.
          if (err instanceof ApiError && err.status === 409) {
            const conflictMessage = err.message;
            const proceed = await new Promise<boolean>((resolve) => {
              RNAlert.alert(t('quickQuote', 'materialConflictTitle'), conflictMessage, [
                { text: t('common', 'cancel'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('quickQuote', 'proceedAnyway'), onPress: () => resolve(true) },
              ]);
            });
            if (!proceed) {
              setResult(null);
              return;
            }
            quotation = await createQuotation({ ...quotationPayload, material_conflict_acknowledged: true });
          } else {
            throw err;
          }
        }

        setResult({
          kind: 'feasible',
          quotationNumber: quotation.quotation_number,
          total: quotation.total_amount,
          validUntil: quotation.valid_until,
        });
      } else {
        setStatusLine(t('quickQuote', 'notifyingAdmin'));
        await requestFeasibilityException(
          created.id,
          'Requested via mobile Quick Quote — raw material/capacity shortfall on initial check.',
        );
        setResult({ kind: 'not_feasible' });
      }
    } catch (err: any) {
      setFormError(err?.message ?? t('quickQuote', 'genericError'));
    } finally {
      setIsChecking(false);
      setStatusLine('');
    }
  }

  if (result) {
    const isYes = result.kind === 'feasible';
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <GlassCard strong style={styles.resultCard}>
          <View style={[styles.resultIcon, isYes ? styles.iconYes : styles.iconNo]}>
            <Text style={[styles.resultIconText, { color: isYes ? colors.emerald400 : colors.red400 }]}>
              {isYes ? '✓' : '✕'}
            </Text>
          </View>
          <Text style={[styles.resultTitle, { color: isYes ? colors.emerald400 : colors.red400 }]}>
            {isYes ? t('quickQuote', 'yesTitle') : t('quickQuote', 'noTitle')}
          </Text>
          <Text style={styles.resultDetail}>
            {isYes ? t('quickQuote', 'yesDetail') : t('quickQuote', 'noDetail')}
          </Text>

          {isYes && result.kind === 'feasible' && (
            <View style={styles.summaryBox}>
              <SummaryRow label={t('quickQuote', 'quotationNumberLabel')} value={result.quotationNumber} />
              <SummaryRow label={t('quickQuote', 'totalLabel')} value={result.total.toFixed(2)} />
              <SummaryRow label={t('quickQuote', 'validUntilLabel')} value={result.validUntil} />
            </View>
          )}

          <Button variant="ghost" onPress={resetForm} style={{ marginTop: 22, width: '100%' }}>
            {t('quickQuote', 'startAnother')}
          </Button>
        </GlassCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <GlassCard strong style={styles.formCard}>
        <Alert variant="error">{loadError ?? formError}</Alert>

        <View style={{ gap: 18 }}>
          <SelectField
            label={t('quickQuote', 'clientLabel')}
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder={customers.length ? t('quickQuote', 'clientPlaceholderLoaded') : t('quickQuote', 'clientPlaceholderLoading')}
          />
          <SelectField
            label={t('quickQuote', 'productLabel')}
            value={productId}
            onChange={setProductId}
            options={productOptions}
            placeholder={products.length ? t('quickQuote', 'productPlaceholderLoaded') : t('quickQuote', 'productPlaceholderLoading')}
          />
          <TextField
            label={t('quickQuote', 'quantityLabel')}
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={setQuantity}
            placeholder={t('quickQuote', 'quantityPlaceholder')}
          />
          <DateField
            label={t('quickQuote', 'dateLabel')}
            value={date}
            onChange={setDate}
            minimumDate={new Date()}
            hint={t('quickQuote', 'dateHint')}
          />
        </View>

        <Button onPress={handleCheck} isLoading={isChecking} style={styles.checkBtn}>
          {t('quickQuote', 'checkButton')}
        </Button>
        {statusLine ? <Text style={styles.statusLine}>{statusLine}</Text> : null}
      </GlassCard>
    </ScrollView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  formCard: { padding: 22 },
  checkBtn: { marginTop: 24, width: '100%' },
  statusLine: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: fonts.sans,
    fontSize: 12,
    color: whiteAlpha(0.5),
  },

  resultCard: { padding: 30, alignItems: 'center' },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconYes: { backgroundColor: 'rgba(16,185,129,0.15)' },
  iconNo: { backgroundColor: 'rgba(239,68,68,0.15)' },
  resultIconText: { fontSize: 28, fontFamily: fonts.sansBold },
  resultTitle: { fontFamily: fonts.display, fontSize: 18, marginBottom: 8, textAlign: 'center' },
  resultDetail: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.55), textAlign: 'center', lineHeight: 19 },
  summaryBox: {
    marginTop: 20,
    width: '100%',
    backgroundColor: whiteAlpha(0.04),
    borderRadius: 12,
    padding: 14,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.5) },
  summaryValue: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.white },
});
