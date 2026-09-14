import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { SelectField, SelectOption } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusTransitionButtons } from '../../components/StatusTransitionButtons';
import { TextField } from '../../components/TextField';
import { colors, fonts, whiteAlpha } from '../../theme';
import { ApiError } from '../../api/client';
import { useLocale } from '../../i18n/LocaleContext';
import { confirm } from '../../utils/alerts';
import { formatCurrency } from '../../utils/format';
import { listProducts, Product } from '../../api/catalog';
import {
  getQuotation,
  updateQuotation,
  updateQuotationStatus,
  deleteQuotation,
  downloadQuotationPdf,
  Quotation,
  QuotationLineInput,
  QuotationStatus,
  QUOTATION_TRANSITIONS,
  QUOTATION_STATUSES_REQUIRING_REASON,
} from '../../api/quotations';
import { createOrderFromQuotation } from '../../api/orders';
import { QuotationsStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<QuotationsStackParamList, 'QuotationDetail'>;

interface LineDraft {
  key: string;
  productId: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
}

let keySeq = 0;
function newLine(): LineDraft {
  keySeq += 1;
  return { key: `l${keySeq}`, productId: null, quantity: '', unitPrice: '', discountPercent: '0' };
}

function linesToDraft(quotation: Quotation): LineDraft[] {
  return quotation.lines.map((l) => {
    keySeq += 1;
    return {
      key: `l${keySeq}`,
      productId: String(l.product_id),
      quantity: String(l.quantity),
      unitPrice: String(l.unit_price),
      discountPercent: String(l.discount_percent ?? 0),
    };
  });
}

type LocaleT = ReturnType<typeof useLocale>['t'];
function statusLabel(t: LocaleT, status: QuotationStatus): string {
  return t('quotationStatus', status);
}

export function QuotationDetailScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { quotationId, startInEdit } = route.params;

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, p] = await Promise.all([getQuotation(quotationId), listProducts()]);
      setQuotation(q);
      setProducts(p.items);
      if (!editing) {
        setLines(linesToDraft(q));
        setNotes(q.notes ?? '');
        setDiscountPercent(String(q.discount_percent ?? 0));
      }
    } catch (err: any) {
      setError(err?.message ?? t('quotationDetail', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, [quotationId, editing]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (startInEdit && quotation && quotation.status === 'draft' && !editing) {
      setEditing(true);
    }
  }, [startInEdit, quotation]);

  const productOptions: SelectOption[] = products.map((p) => ({
    label: p.code ? `${p.name} (${p.code})` : p.name,
    value: String(p.id),
  }));

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function startEdit() {
    if (!quotation) return;
    setLines(linesToDraft(quotation));
    setNotes(quotation.notes ?? '');
    setDiscountPercent(String(quotation.discount_percent ?? 0));
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!quotation) return;
    setError(null);

    const parsedLines: QuotationLineInput[] = [];
    for (const line of lines) {
      if (!line.productId) return setError(t('quotationDetail', 'selectProductError'));
      const qty = parseFloat(line.quantity);
      if (!qty || qty <= 0) return setError(t('quotationDetail', 'invalidQuantityError'));
      const unitPrice = parseFloat(line.unitPrice);
      if (Number.isNaN(unitPrice) || unitPrice < 0) return setError(t('quotationDetail', 'invalidPriceError'));
      const disc = parseFloat(line.discountPercent) || 0;
      parsedLines.push({ product_id: Number(line.productId), quantity: qty, unit_price: unitPrice, discount_percent: disc });
    }

    setSaving(true);
    try {
      const payload = {
        notes: notes.trim() || null,
        discount_percent: parseFloat(discountPercent) || 0,
        lines: parsedLines,
      };
      let updated: Quotation;
      try {
        updated = await updateQuotation(quotation.id, payload);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const proceed = await confirm(
            t('quotationDetail', 'materialConflictTitle'),
            err.message,
            t('quotationDetail', 'proceedAnyway'),
            t('common', 'cancel'),
          );
          if (!proceed) return;
          updated = await updateQuotation(quotation.id, { ...payload, material_conflict_acknowledged: true });
        } else {
          throw err;
        }
      }
      setQuotation(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err?.message ?? t('quotationDetail', 'saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!quotation) return;
    const proceed = await confirm(
      t('quotationDetail', 'deleteConfirmTitle'),
      t('quotationDetail', 'deleteConfirmMessage', { number: quotation.quotation_number }),
      t('common', 'delete'),
      t('common', 'cancel'),
      { destructive: true },
    );
    if (!proceed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteQuotation(quotation.id);
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message ?? t('quotationDetail', 'deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleStatusChange(status: any, reason?: string) {
    if (!quotation) return;
    setStatusBusy(true);
    setError(null);
    try {
      const updated = await updateQuotationStatus(quotation.id, status, reason);
      setQuotation(updated);
    } catch (err: any) {
      setError(err?.message ?? t('quotationDetail', 'saveError'));
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleConvert() {
    if (!quotation) return;
    const proceed = await confirm(
      t('quotationDetail', 'convertConfirmTitle'),
      t('quotationDetail', 'convertConfirmMessage', { number: quotation.quotation_number }),
      t('quotationDetail', 'convertConfirm'),
      t('common', 'cancel'),
    );
    if (!proceed) return;
    setConverting(true);
    setError(null);
    try {
      const order = await createOrderFromQuotation(quotation.id);
      (navigation.getParent() as any)?.navigate('Orders', { screen: 'OrderDetail', params: { orderId: order.id } });
    } catch (err: any) {
      setError(err?.message ?? t('quotationDetail', 'convertError'));
    } finally {
      setConverting(false);
    }
  }

  async function handleDownloadPdf() {
    if (!quotation) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadQuotationPdf(quotation.id, quotation.quotation_number);
    } catch (err: any) {
      setError(err?.message ?? t('quotationDetail', 'downloadPdfError'));
    } finally {
      setDownloading(false);
    }
  }

  if (loading && !quotation) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loadingText}>{t('common', 'loading')}</Text>
      </View>
    );
  }

  if (!quotation) {
    return (
      <View style={styles.screen}>
        <Alert variant="error">{error}</Alert>
      </View>
    );
  }

  const nextStatuses = QUOTATION_TRANSITIONS[quotation.status];
  const isDraft = quotation.status === 'draft';

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <GlassCard strong style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{quotation.quotation_number}</Text>
            <Text style={styles.subtitle}>{quotation.customer_name ?? '—'}</Text>
          </View>
          <StatusBadge status={quotation.status} label={statusLabel(t, quotation.status)} />
          {isDraft && !editing && (
            <Pressable onPress={startEdit} hitSlop={10} style={styles.headerIconBtn}>
              <Feather name="edit-2" size={18} color={whiteAlpha(0.7)} />
            </Pressable>
          )}
        </View>

        <Alert variant="error">{error}</Alert>

        <View style={styles.metaBox}>
          <MetaRow label={t('quotationDetail', 'dateLabel')} value={quotation.quotation_date} />
          <MetaRow label={t('quotationDetail', 'validUntilLabel')} value={quotation.valid_until ?? '—'} />
          {quotation.converted_order_id && (
            <MetaRow label={t('quotationDetail', 'convertedOrderLabel')} value={`#${quotation.converted_order_id}`} />
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('quotationDetail', 'linesTitle')}</Text>

        {editing ? (
          <View style={{ gap: 14 }}>
            {lines.map((line, index) => (
              <View key={line.key} style={styles.lineEditRow}>
                <View style={{ flex: 1, gap: 10 }}>
                  <SelectField
                    label={`${t('quotationDetail', 'productLabel')} ${index + 1}`}
                    value={line.productId}
                    onChange={(v) => updateLine(line.key, { productId: v })}
                    options={productOptions}
                    placeholder={t('quotationDetail', 'productPlaceholder')}
                  />
                  <View style={styles.rowFields}>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label={t('quotationDetail', 'quantityLabel')}
                        keyboardType="decimal-pad"
                        value={line.quantity}
                        onChangeText={(v) => updateLine(line.key, { quantity: v })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label={t('quotationDetail', 'unitPriceLabel')}
                        keyboardType="decimal-pad"
                        value={line.unitPrice}
                        onChangeText={(v) => updateLine(line.key, { unitPrice: v })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label={t('quotationDetail', 'discountLabel')}
                        keyboardType="decimal-pad"
                        value={line.discountPercent}
                        onChangeText={(v) => updateLine(line.key, { discountPercent: v })}
                      />
                    </View>
                  </View>
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
              <Text style={styles.addLineText}>{t('quotationDetail', 'addLine')}</Text>
            </Pressable>

            <TextField
              label={t('quotationDetail', 'discountPercentLabel')}
              keyboardType="decimal-pad"
              value={discountPercent}
              onChangeText={setDiscountPercent}
            />
            <TextField
              label={t('quotationDetail', 'notesLabel')}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={{ height: 80, textAlignVertical: 'top' }}
            />

            <View style={styles.wizardNav}>
              <Button variant="ghost" onPress={() => setEditing(false)} style={{ flex: 1 }}>
                {t('common', 'cancel')}
              </Button>
              <Button isLoading={saving} onPress={handleSave} style={{ flex: 1 }}>
                {t('common', 'save')}
              </Button>
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {quotation.lines.map((line) => (
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
              <MetaRow label={t('quotationDetail', 'subtotalLabel')} value={formatCurrency(quotation.subtotal_amount)} />
              {quotation.discount_amount > 0 && (
                <MetaRow label={t('quotationDetail', 'discountAmountLabel')} value={`-${formatCurrency(quotation.discount_amount)}`} />
              )}
              <MetaRow label={t('quotationDetail', 'totalLabel')} value={formatCurrency(quotation.total_amount)} bold />
            </View>

            {quotation.notes ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.sectionTitle}>{t('quotationDetail', 'notesLabel')}</Text>
                <Text style={styles.notesText}>{quotation.notes}</Text>
              </View>
            ) : null}
          </View>
        )}

        {!editing && (
          <>
            {nextStatuses.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.sectionTitle}>{t('quotationDetail', 'statusActionsTitle')}</Text>
                <StatusTransitionButtons
                  nextStatuses={nextStatuses}
                  reasonRequiredFor={QUOTATION_STATUSES_REQUIRING_REASON}
                  reasonLabel={t('quotationDetail', 'reasonLabel')}
                  reasonRequiredError={t('quotationDetail', 'reasonRequiredError')}
                  cancelLabel={t('common', 'cancel')}
                  confirmLabel={t('common', 'confirm')}
                  statusLabel={(s) => statusLabel(t, s as QuotationStatus)}
                  busy={statusBusy}
                  onChange={handleStatusChange}
                />
              </View>
            )}

            {quotation.status === 'accepted' && (
              <Button
                variant="success"
                onPress={handleConvert}
                isLoading={converting}
                style={{ marginTop: 16, width: '100%' }}
              >
                {t('quotationDetail', 'convertToOrder')}
              </Button>
            )}

            <Button onPress={handleDownloadPdf} isLoading={downloading} variant="ghost" style={{ marginTop: 16, width: '100%' }}>
              {t('quotationDetail', 'downloadPdf')}
            </Button>

            <Button variant="danger" onPress={handleDelete} isLoading={deleting} style={{ marginTop: 12, width: '100%' }}>
              {t('quotationDetail', 'deleteQuotation')}
            </Button>
          </>
        )}
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

  lineEditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  removeLineBtn: { padding: 10, marginTop: 26 },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  addLineText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.gold300 },
  rowFields: { flexDirection: 'row', gap: 10 },
  wizardNav: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
