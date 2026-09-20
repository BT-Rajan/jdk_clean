import { ReactNode, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { confirm } from '../utils/alerts';
import {
  listProducts,
  Product,
  createFeasibility,
  runFeasibility,
  requestFeasibilityException,
  createQuotation,
  getQuotationForFeasibility,
  downloadQuotationPdf,
} from '../api/catalog';

// 'feasible_pending' -- the check passed but nothing has been quoted
// yet; the green "Generate Quotation" button is the explicit action
// that actually creates it (previously this happened automatically the
// instant the check passed, with no confirmation step at all).
type ResultState =
  | { kind: 'feasible_pending'; feasibilityId: number; customerId: number; productId: number; quantity: number; unitPrice: number }
  | { kind: 'feasible'; quotationId: number; quotationNumber: string; total: number; validUntil: string }
  // nextAvailableDate: the latest (slowest) per-line estimated_ready_date
  // the backend projected -- production can't start before every line's
  // material/capacity is ready, so the slowest one is what actually
  // applies to the whole request. Absent when the backend couldn't
  // reliably project a date at all (see FeasibilityLineOut).
  | { kind: 'not_feasible'; nextAvailableDate?: string }
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
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

  // Step 1 -- the feasibility check itself. On a pass this only reveals
  // the "Generate Quotation" button; it doesn't create anything yet.
  async function handleCheck() {
    setFormError(null);
    const qty = parseFloat(quantity);

    if (!customerId) return setFormError(t('quickQuote', 'selectClientError'));
    if (!productId) return setFormError(t('quickQuote', 'selectProductError'));
    if (!qty || qty <= 0) return setFormError(t('quickQuote', 'invalidQuantityError'));
    if (!date) return setFormError(t('quickQuote', 'selectDateError'));

    setIsChecking(true);
    try {
      setStatusLine(t('quickQuote', 'runningCheck'));
      const created = await createFeasibility({
        customer_id: Number(customerId),
        required_by_date: toIsoDate(date),
        lines: [{ product_id: Number(productId), quantity: qty }],
      });
      const checked = await runFeasibility(created.id);

      if (checked.status === 'feasible') {
        const product = products.find((p) => String(p.id) === productId);
        setResult({
          kind: 'feasible_pending',
          feasibilityId: created.id,
          customerId: Number(customerId),
          productId: Number(productId),
          quantity: qty,
          unitPrice: product?.selling_price ?? 0,
        });
      } else if (checked.status === 'converted') {
        // Backend-side "auto-create quotation on feasible" is on for
        // this org (Settings -> Sales; see
        // feasibility_service._maybe_auto_create_quotation) -- run_check
        // itself already created the quotation before this response
        // came back, so there's nothing left to press. Fetch what it
        // made and go straight to the success screen.
        setStatusLine(t('quickQuote', 'generatingQuote'));
        const quotation = await getQuotationForFeasibility(created.id);
        if (quotation) {
          setResult({
            kind: 'feasible',
            quotationId: quotation.id,
            quotationNumber: quotation.quotation_number,
            total: quotation.total_amount,
            validUntil: quotation.valid_until,
          });
        } else {
          // Shouldn't happen -- 'converted' implies a quotation exists --
          // but don't leave the user stuck on a silent failure if it does.
          setFormError(t('quickQuote', 'genericError'));
        }
      } else if (checked.status === 'exception_pending') {
        setStatusLine(t('quickQuote', 'notifyingAdmin'));
        await requestFeasibilityException(
          created.id,
          'Requested via mobile Quick Quote — raw material/capacity shortfall on initial check.',
        );
        // The slowest projected date across every line -- the whole
        // request can't be ready before all of its lines are, so a
        // single earlier line's date would understate it.
        const nextAvailableDate = checked.lines
          .map((line) => line.estimated_ready_date)
          .filter((d): d is string => Boolean(d))
          .sort()
          .pop();
        setResult({ kind: 'not_feasible', nextAvailableDate });
      } else {
        // Any other status is unexpected for a feasibility this handler
        // just created and ran itself -- surface it plainly rather than
        // guessing at an action (e.g. blindly requesting an exception
        // that isn't valid for this status).
        setFormError(t('quickQuote', 'unexpectedStatusError', { status: checked.status }));
      }
    } catch (err: any) {
      setFormError(err?.message ?? t('quickQuote', 'genericError'));
    } finally {
      setIsChecking(false);
      setStatusLine('');
    }
  }

  // Step 2 -- only reached by explicitly pressing "Generate Quotation".
  async function handleGenerateQuotation(pending: Extract<ResultState, { kind: 'feasible_pending' }>) {
    setFormError(null);
    setIsGenerating(true);
    try {
      const quotationPayload = {
        customer_id: pending.customerId,
        feasibility_id: pending.feasibilityId,
        quotation_date: toIsoDate(new Date()),
        lines: [{ product_id: pending.productId, quantity: pending.quantity, unit_price: pending.unitPrice, discount_percent: 0 }],
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
          const proceed = await confirm(
            t('quickQuote', 'materialConflictTitle'),
            conflictMessage,
            t('quickQuote', 'proceedAnyway'),
            t('common', 'cancel'),
          );
          if (!proceed) return;
          quotation = await createQuotation({ ...quotationPayload, material_conflict_acknowledged: true });
        } else {
          throw err;
        }
      }

      setResult({
        kind: 'feasible',
        quotationId: quotation.id,
        quotationNumber: quotation.quotation_number,
        total: quotation.total_amount,
        validUntil: quotation.valid_until,
      });
    } catch (err: any) {
      setFormError(err?.message ?? t('quickQuote', 'genericError'));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownloadPdf(quotationId: number, quotationNumber: string) {
    setFormError(null);
    setIsDownloadingPdf(true);
    try {
      await downloadQuotationPdf(quotationId, quotationNumber);
    } catch (err: any) {
      setFormError(err?.message ?? t('quickQuote', 'downloadPdfError'));
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const pageTitle = t('drawer', 'enquiry');

  if (result?.kind === 'feasible_pending') {
    return (
      <ScreenBody title={pageTitle}>
        <GlassCard strong style={styles.resultCard}>
          <View style={[styles.resultIcon, styles.iconYes]}>
            <Text style={[styles.resultIconText, { color: colors.emerald400 }]}>✓</Text>
          </View>
          <Text style={[styles.resultTitle, { color: colors.emerald400 }]}>{t('quickQuote', 'yesTitle')}</Text>
          <Text style={styles.resultDetail}>{t('quickQuote', 'feasibleDetail')}</Text>

          <Alert variant="error">{formError}</Alert>

          <Button
            variant="success"
            onPress={() => handleGenerateQuotation(result)}
            isLoading={isGenerating}
            style={{ marginTop: 22, width: '100%' }}
          >
            {t('quickQuote', 'generateQuotation')}
          </Button>
        </GlassCard>
      </ScreenBody>
    );
  }

  if (result?.kind === 'not_feasible') {
    return (
      <ScreenBody title={pageTitle}>
        <GlassCard strong style={styles.resultCard}>
          <View style={[styles.resultIcon, styles.iconNo]}>
            <Text style={[styles.resultIconText, { color: colors.red400 }]}>✕</Text>
          </View>
          <Text style={[styles.resultTitle, { color: colors.red400 }]}>{t('quickQuote', 'noTitle')}</Text>
          <Text style={styles.resultDetail}>{t('quickQuote', 'noDetail')}</Text>

          {result.nextAvailableDate && (
            <View style={styles.summaryBox}>
              <SummaryRow label={t('quickQuote', 'nextAvailableLabel')} value={result.nextAvailableDate} />
            </View>
          )}

          <Button variant="subtle" onPress={resetForm} style={{ marginTop: 22, width: '100%' }}>
            {t('quickQuote', 'tryAgain')}
          </Button>
        </GlassCard>
      </ScreenBody>
    );
  }

  if (result?.kind === 'feasible') {
    return (
      <ScreenBody title={pageTitle}>
        <GlassCard strong style={styles.resultCard}>
          <View style={[styles.resultIcon, styles.iconYes]}>
            <Text style={[styles.resultIconText, { color: colors.emerald400 }]}>✓</Text>
          </View>
          <Text style={[styles.resultTitle, { color: colors.emerald400 }]}>{t('quickQuote', 'yesTitle')}</Text>
          <Text style={styles.resultDetail}>{t('quickQuote', 'yesDetail')}</Text>

          <Alert variant="error">{formError}</Alert>

          <View style={styles.summaryBox}>
            <SummaryRow label={t('quickQuote', 'quotationNumberLabel')} value={result.quotationNumber} />
            <SummaryRow label={t('quickQuote', 'totalLabel')} value={result.total.toFixed(2)} />
            <SummaryRow label={t('quickQuote', 'validUntilLabel')} value={result.validUntil} />
          </View>

          <Button
            onPress={() => handleDownloadPdf(result.quotationId, result.quotationNumber)}
            isLoading={isDownloadingPdf}
            style={{ marginTop: 22, width: '100%' }}
          >
            {t('quickQuote', 'downloadPdf')}
          </Button>
          <Button variant="ghost" size="sm" onPress={resetForm} style={{ marginTop: 10, width: '100%' }}>
            {t('quickQuote', 'startAnother')}
          </Button>
        </GlassCard>
      </ScreenBody>
    );
  }

  return (
    <ScreenBody title={pageTitle} keyboardShouldPersistTaps="handled">
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
    </ScreenBody>
  );
}

// Pins the page title at the top and centers the (usually much shorter
// than the viewport) card in the space below it, rather than leaving
// it stranded near the top with a stretch of empty screen underneath --
// same spirit as HomeScreen's tile grid filling available height.
function ScreenBody({ title, keyboardShouldPersistTaps, children }: { title: string; keyboardShouldPersistTaps?: 'handled'; children: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps={keyboardShouldPersistTaps}>
      <Text style={styles.pageTitle}>{title}</Text>
      <View style={styles.centerArea}>{children}</View>
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
  pageTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.white, marginBottom: 16 },
  centerArea: { flex: 1, justifyContent: 'center', width: '100%' },
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
