import { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { CustomerStandingNotice } from '../../components/CustomerStandingNotice';
import { DateField } from '../../components/DateField';
import { GlassCard } from '../../components/GlassCard';
import { SelectField, SelectOption } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { colors, fonts, whiteAlpha } from '../../theme';
import { ApiError } from '../../api/client';
import { useLocale } from '../../i18n/LocaleContext';
import { listCustomers, Customer } from '../../api/customers';
import { customerOptionLabel } from '../../utils/customerOptionLabel';
import { confirm } from '../../utils/alerts';
import { toIsoDate } from '../../utils/format';
import { listProducts, Product } from '../../api/catalog';
import { createFeasibility, getFeasibility, runFeasibilityCheck, requestFeasibilityException, Feasibility } from '../../api/feasibility';
import { checkMaterialConflicts, createQuotation, downloadQuotationPdf, getQuotationForFeasibility, MaterialConflict } from '../../api/quotations';
import { QuotationsStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<QuotationsStackParamList, 'NewQuotation'>;

interface LineDraft {
  key: string;
  productId: string | null;
  quantity: string;
}

interface PendingLine {
  productId: number;
  quantity: number;
  unitPrice: number;
}

// 'feasible_pending' -- the check passed but nothing has been quoted
// yet; the "Generate Quotation" button is the explicit action that
// actually creates it.
type ResultState =
  | { kind: 'feasible_pending'; feasibilityId: number; customerId: number; lines: PendingLine[] }
  | { kind: 'feasible'; quotationId: number; quotationNumber: string; total: number; validUntil: string }
  // nextAvailableDate: the slowest per-line estimated_ready_date the
  // backend projected -- production can't start before every line's
  // material/capacity is ready.
  | { kind: 'not_feasible'; nextAvailableDate?: string }
  | null;

let keySeq = 0;
function newLine(): LineDraft {
  keySeq += 1;
  return { key: `l${keySeq}`, productId: null, quantity: '' };
}

export function NewQuotationScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  // Preset when arriving here from a Client's activity hub ("+
  // Quotation" for that client) or a Product Catalog row's "Start
  // Quotation" action -- either way this is still the same feasibility
  // -> quotation flow, just with the first field(s) already filled in.
  const presetCustomerId = route.params?.customerId;
  const presetProductId = route.params?.productId;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | null>(presetCustomerId ? String(presetCustomerId) : null);
  const [lines, setLines] = useState<LineDraft[]>(() => {
    const first = newLine();
    return [presetProductId ? { ...first, productId: String(presetProductId) } : first];
  });
  const [date, setDate] = useState<Date | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [result, setResult] = useState<ResultState>(null);
  // A feasibility check that's been created but not yet confirmed to
  // have run -- set as soon as createFeasibility succeeds, cleared once
  // run/read-back completes either way. Lets a retry (e.g. connectivity
  // dropped between create and run) resume the same record instead of
  // creating another orphaned draft every time "Check" is pressed --
  // `key` guards against reusing it once the form's actual inputs have
  // since changed.
  const [pendingCheck, setPendingCheck] = useState<{ feasibilityId: number; key: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([listCustomers({ page_size: 200 }), listProducts()]);
        setCustomers(c.items);
        setProducts(p.items);
      } catch (err: any) {
        setLoadError(err?.message ?? t('newQuotation', 'genericError'));
      }
    })();
  }, []);

  const customerOptions: SelectOption[] = customers.map((c) => ({ label: customerOptionLabel(t, c), value: String(c.id) }));
  const selectedCustomer = customerId ? customers.find((c) => String(c.id) === customerId) ?? null : null;
  const productOptions: SelectOption[] = products.map((p) => ({
    label: p.code ? `${p.name} (${p.code})` : p.name,
    value: String(p.id),
  }));

  function resetForm() {
    setResult(null);
    setCustomerId(null);
    setLines([newLine()]);
    setDate(null);
    setFormError(null);
    setPendingCheck(null);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  // Step 1 -- the feasibility check itself. On a pass this only reveals
  // the "Generate Quotation" button; it doesn't create anything yet.
  async function handleCheck() {
    setFormError(null);

    if (!customerId) return setFormError(t('newQuotation', 'selectClientError'));
    if (!date) return setFormError(t('newQuotation', 'selectDateError'));

    const parsedLines: { productId: number; quantity: number }[] = [];
    for (const line of lines) {
      if (!line.productId) return setFormError(t('newQuotation', 'selectProductError'));
      const qty = parseFloat(line.quantity);
      if (!qty || qty <= 0) return setFormError(t('newQuotation', 'invalidQuantityError'));
      parsedLines.push({ productId: Number(line.productId), quantity: qty });
    }

    // Identifies this exact set of inputs -- only reuse a pending
    // feasibility record if the form still matches what created it;
    // otherwise (the salesman changed something before retrying) a
    // fresh check is the correct thing to create.
    const checkKey = JSON.stringify({ customerId, date: toIsoDate(date), parsedLines });

    setIsChecking(true);
    try {
      setStatusLine(t('newQuotation', 'runningCheck'));

      let feasibilityId: number;
      if (pendingCheck && pendingCheck.key === checkKey) {
        feasibilityId = pendingCheck.feasibilityId;
      } else {
        const created = await createFeasibility({
          customer_id: Number(customerId),
          required_by_date: toIsoDate(date),
          lines: parsedLines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
        });
        feasibilityId = created.id;
        setPendingCheck({ feasibilityId, key: checkKey });
      }

      let checked: Feasibility;
      try {
        checked = await runFeasibilityCheck(feasibilityId);
      } catch (err) {
        // A 409 here specifically means this check is no longer 'draft'
        // -- i.e. an earlier attempt's run() actually went through on
        // the server and only its response got lost (the connectivity-
        // drop case this resume logic exists for). Read back its
        // current state instead of treating that as a fresh failure.
        if (err instanceof ApiError && err.status === 409) {
          checked = await getFeasibility(feasibilityId);
        } else {
          throw err;
        }
      }

      if (checked.status === 'feasible') {
        const pendingLines: PendingLine[] = parsedLines.map((l) => {
          const product = products.find((p) => p.id === l.productId);
          return { productId: l.productId, quantity: l.quantity, unitPrice: product?.selling_price ?? 0 };
        });
        setResult({ kind: 'feasible_pending', feasibilityId, customerId: Number(customerId), lines: pendingLines });
      } else if (checked.status === 'converted') {
        // Backend-side "auto-create quotation on feasible" is on for
        // this org (Settings -> Sales) -- run_check itself already
        // created the quotation before this response came back.
        setStatusLine(t('newQuotation', 'generatingQuote'));
        const quotation = await getQuotationForFeasibility(feasibilityId);
        if (quotation) {
          setResult({
            kind: 'feasible',
            quotationId: quotation.id,
            quotationNumber: quotation.quotation_number,
            total: quotation.total_amount,
            validUntil: quotation.valid_until ?? '',
          });
        } else {
          setFormError(t('newQuotation', 'genericError'));
        }
      } else if (checked.status === 'exception_pending') {
        setStatusLine(t('newQuotation', 'notifyingAdmin'));
        // Idempotent while still exception_pending (see
        // feasibility_service.decide_exception) -- safe to send again
        // if a first attempt's request went through but its response
        // didn't come back.
        await requestFeasibilityException(
          feasibilityId,
          'Requested via mobile Quotations — raw material/capacity shortfall on initial check.',
        );
        const nextAvailableDate = checked.lines
          .map((line) => line.estimated_ready_date)
          .filter((d): d is string => Boolean(d))
          .sort()
          .pop();
        setResult({ kind: 'not_feasible', nextAvailableDate });
      } else {
        setFormError(t('newQuotation', 'unexpectedStatusError', { status: checked.status }));
      }
      // The check reached a real outcome one way or another -- nothing
      // left to resume.
      setPendingCheck(null);
    } catch (err: any) {
      setFormError(err?.message ?? t('newQuotation', 'genericError'));
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
        lines: pending.lines.map((l) => ({
          product_id: l.productId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          discount_percent: 0,
        })),
      };

      // Live pre-check (same one the web app's quotation form uses) --
      // decides up front whether these lines' material needs actually
      // overlap another open quotation/order, rather than inferring a
      // material conflict from a bare 409 on create. A create can 409
      // for unrelated reasons too -- e.g. the underlying feasibility
      // check was already marked converted by an earlier attempt whose
      // response got lost to a dropped connection -- and treating every
      // 409 as "materials?" showed a confusing, wrong prompt for those.
      const conflicts = await checkMaterialConflicts(
        quotationPayload.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      );

      let materialConflictAcknowledged = false;
      if (conflicts.length > 0) {
        const proceed = await confirm(
          t('newQuotation', 'materialConflictTitle'),
          materialConflictMessage(conflicts),
          t('newQuotation', 'proceedAnyway'),
          t('common', 'cancel'),
        );
        if (!proceed) return;
        materialConflictAcknowledged = true;
      }

      const quotation = await createQuotation({ ...quotationPayload, material_conflict_acknowledged: materialConflictAcknowledged });

      setResult({
        kind: 'feasible',
        quotationId: quotation.id,
        quotationNumber: quotation.quotation_number,
        total: quotation.total_amount,
        validUntil: quotation.valid_until ?? '',
      });
    } catch (err: any) {
      setFormError(err?.message ?? t('newQuotation', 'genericError'));
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
      setFormError(err?.message ?? t('newQuotation', 'downloadPdfError'));
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  if (result?.kind === 'feasible_pending') {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <GlassCard strong style={styles.resultCard}>
          <View style={[styles.resultIcon, styles.iconYes]}>
            <Text style={[styles.resultIconText, { color: colors.emerald400 }]}>✓</Text>
          </View>
          <Text style={[styles.resultTitle, { color: colors.emerald400 }]}>{t('newQuotation', 'yesTitle')}</Text>
          <Text style={styles.resultDetail}>{t('newQuotation', 'feasibleDetail')}</Text>

          <Alert variant="error">{formError}</Alert>

          <Button
            variant="success"
            onPress={() => handleGenerateQuotation(result)}
            isLoading={isGenerating}
            style={{ marginTop: 22, width: '100%' }}
          >
            {t('newQuotation', 'generateQuotation')}
          </Button>
        </GlassCard>
      </ScrollView>
    );
  }

  if (result?.kind === 'not_feasible') {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <GlassCard strong style={styles.resultCard}>
          <View style={[styles.resultIcon, styles.iconNo]}>
            <Text style={[styles.resultIconText, { color: colors.red400 }]}>✕</Text>
          </View>
          <Text style={[styles.resultTitle, { color: colors.red400 }]}>{t('newQuotation', 'noTitle')}</Text>
          <Text style={styles.resultDetail}>{t('newQuotation', 'noDetail')}</Text>

          {result.nextAvailableDate && (
            <View style={styles.summaryBox}>
              <SummaryRow label={t('newQuotation', 'nextAvailableLabel')} value={result.nextAvailableDate} />
            </View>
          )}

          <Button variant="subtle" onPress={resetForm} style={{ marginTop: 22, width: '100%' }}>
            {t('newQuotation', 'tryAgain')}
          </Button>
        </GlassCard>
      </ScrollView>
    );
  }

  if (result?.kind === 'feasible') {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <GlassCard strong style={styles.resultCard}>
          <View style={[styles.resultIcon, styles.iconYes]}>
            <Text style={[styles.resultIconText, { color: colors.emerald400 }]}>✓</Text>
          </View>
          <Text style={[styles.resultTitle, { color: colors.emerald400 }]}>{t('newQuotation', 'yesTitle')}</Text>
          <Text style={styles.resultDetail}>{t('newQuotation', 'yesDetail')}</Text>

          <Alert variant="error">{formError}</Alert>

          <View style={styles.summaryBox}>
            <SummaryRow label={t('newQuotation', 'quotationNumberLabel')} value={result.quotationNumber} />
            <SummaryRow label={t('newQuotation', 'totalLabel')} value={result.total.toFixed(3)} />
            <SummaryRow label={t('newQuotation', 'validUntilLabel')} value={result.validUntil} />
          </View>

          <Button
            onPress={() => navigation.replace('QuotationDetail', { quotationId: result.quotationId })}
            style={{ marginTop: 22, width: '100%' }}
          >
            {t('newQuotation', 'viewQuotation')}
          </Button>
          <Button
            variant="ghost"
            onPress={() => handleDownloadPdf(result.quotationId, result.quotationNumber)}
            isLoading={isDownloadingPdf}
            style={{ marginTop: 10, width: '100%' }}
          >
            {t('newQuotation', 'downloadPdf')}
          </Button>
          <Button variant="ghost" size="sm" onPress={resetForm} style={{ marginTop: 10, width: '100%' }}>
            {t('newQuotation', 'startAnother')}
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
            label={t('newQuotation', 'clientLabel')}
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder={customers.length ? t('newQuotation', 'clientPlaceholderLoaded') : t('newQuotation', 'clientPlaceholderLoading')}
          />
          {selectedCustomer && <CustomerStandingNotice customer={selectedCustomer} />}

          <View style={{ gap: 14 }}>
            {lines.map((line, index) => (
              <View key={line.key} style={styles.lineRow}>
                <View style={{ flex: 1, gap: 10 }}>
                  <SelectField
                    label={`${t('newQuotation', 'productLabel')} ${index + 1}`}
                    value={line.productId}
                    onChange={(v) => updateLine(line.key, { productId: v })}
                    options={productOptions}
                    placeholder={products.length ? t('newQuotation', 'productPlaceholderLoaded') : t('newQuotation', 'productPlaceholderLoading')}
                  />
                  <TextField
                    label={t('newQuotation', 'quantityLabel')}
                    keyboardType="decimal-pad"
                    value={line.quantity}
                    onChangeText={(v) => updateLine(line.key, { quantity: v })}
                    placeholder={t('newQuotation', 'quantityPlaceholder')}
                  />
                </View>
                {lines.length > 1 && (
                  <Pressable onPress={() => removeLine(line.key)} hitSlop={10} style={styles.removeLineBtn}>
                    <Feather name="trash-2" size={16} color={colors.red400} />
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable onPress={addLine} style={styles.addLineBtn}>
              <Feather name="plus" size={14} color={colors.gold300} />
              <Text style={styles.addLineText}>{t('newQuotation', 'addLine')}</Text>
            </Pressable>
          </View>

          <DateField
            label={t('newQuotation', 'dateLabel')}
            value={date}
            onChange={setDate}
            minimumDate={new Date()}
            hint={t('newQuotation', 'dateHint')}
          />
        </View>

        <Button onPress={handleCheck} isLoading={isChecking} style={styles.checkBtn}>
          {t('newQuotation', 'checkButton')}
        </Button>
        {statusLine ? <Text style={styles.statusLine}>{statusLine}</Text> : null}
      </GlassCard>
    </ScrollView>
  );
}

// Mirrors the phrasing quotation_service.create_quotation's own 409
// used to use for the same data, back when the client inferred a
// conflict from that error instead of pre-checking for one.
function materialConflictMessage(conflicts: MaterialConflict[]): string {
  return (
    conflicts
      .map(
        (c) =>
          `${c.name} short by ${c.shortfall} ${c.unit} (also needed by ${c.competing_quotations
            .map((cq) => cq.quotation_number)
            .join(', ')})`,
      )
      .join('; ') + '.'
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

  lineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  removeLineBtn: { padding: 10, marginBottom: 2 },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  addLineText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.gold300 },

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
