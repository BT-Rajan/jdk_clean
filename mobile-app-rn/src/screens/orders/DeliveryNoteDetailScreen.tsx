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
import { TextField } from '../../components/TextField';
import { colors, fonts, whiteAlpha } from '../../theme';
import { useLocale } from '../../i18n/LocaleContext';
import { formatDate } from '../../utils/format';
import {
  getDeliveryNote,
  updateDeliveryNote,
  updateDeliveryNoteStatus,
  downloadDeliveryNotePdf,
  DeliveryNote,
  DeliveryNoteStatus,
  DELIVERY_NOTE_TRANSITIONS,
  DELIVERY_NOTE_STATUSES_REQUIRING_REASON,
} from '../../api/deliveryNotes';
import { OrdersStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<OrdersStackParamList, 'DeliveryNoteDetail'>;

type LocaleT = ReturnType<typeof useLocale>['t'];
function statusLabel(t: LocaleT, status: DeliveryNoteStatus): string {
  return t('deliveryNoteStatus', status);
}

export function DeliveryNoteDetailScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { deliveryNoteId } = route.params;

  const [note, setNote] = useState<DeliveryNote | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const n = await getDeliveryNote(deliveryNoteId);
      setNote(n);
      const q: Record<number, string> = {};
      for (const line of n.lines) q[line.id] = String(line.quantity_delivered);
      setQuantities(q);
    } catch (err: any) {
      setError(err?.message ?? t('deliveryNoteDetail', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, [deliveryNoteId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function goToOrder() {
    if (!note) return;
    navigation.navigate('OrderDetail', { orderId: note.order_id });
  }

  async function handleSaveQuantities() {
    if (!note) return;
    setError(null);
    setSaving(true);
    try {
      const lines = note.lines.map((l) => ({
        product_id: l.product_id,
        quantity_delivered: Number(quantities[l.id] ?? l.quantity_delivered),
      }));
      const updated = await updateDeliveryNote(note.id, { lines });
      setNote(updated);
      setNotice(t('deliveryNoteDetail', 'quantitiesSaved'));
    } catch (err: any) {
      setError(err?.message ?? t('deliveryNoteDetail', 'saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: any, reason?: string) {
    if (!note) return;
    setStatusBusy(true);
    setError(null);
    try {
      const updated = await updateDeliveryNoteStatus(note.id, status, reason);
      setNote(updated);
      setNotice(
        status === 'issued' ? t('deliveryNoteDetail', 'issuedNotice') : t('deliveryNoteDetail', 'cancelledNotice'),
      );
    } catch (err: any) {
      setError(err?.message ?? t('deliveryNoteDetail', 'saveError'));
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDownloadPdf() {
    if (!note) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadDeliveryNotePdf(note.id, note.delivery_note_number);
    } catch (err: any) {
      setError(err?.message ?? t('deliveryNoteDetail', 'downloadPdfError'));
    } finally {
      setDownloading(false);
    }
  }

  if (loading && !note) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loadingText}>{t('common', 'loading')}</Text>
      </View>
    );
  }

  if (!note) {
    return (
      <View style={styles.screen}>
        <Alert variant="error">{error}</Alert>
      </View>
    );
  }

  const nextStatuses = DELIVERY_NOTE_TRANSITIONS[note.status];
  const isDraft = note.status === 'draft';

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <GlassCard strong style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{note.delivery_note_number}</Text>
            <Pressable
              onPress={goToOrder}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={note.order_number ?? undefined}
            >
              <Text style={[styles.subtitle, styles.linkText]}>{note.order_number ?? '—'}</Text>
            </Pressable>
          </View>
          <StatusBadge status={note.status} label={statusLabel(t, note.status)} />
        </View>

        {notice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}
        <Alert variant="error">{error}</Alert>

        <View style={styles.metaBox}>
          <MetaRow label={t('deliveryNoteDetail', 'customerLabel')} value={note.customer_name ?? '—'} />
          <MetaRow label={t('deliveryNoteDetail', 'deliveryDateLabel')} value={formatDate(note.delivery_date)} />
          {note.auto_created && (
            <MetaRow label={t('deliveryNoteDetail', 'sourceLabel')} value={t('deliveryNoteDetail', 'autoCreated')} />
          )}
          {note.cancel_reason && <MetaRow label={t('deliveryNoteDetail', 'cancelReasonLabel')} value={note.cancel_reason} />}
        </View>

        {note.notes ? (
          <View style={{ marginBottom: 18 }}>
            <Text style={styles.sectionTitle}>{t('deliveryNoteDetail', 'notesLabel')}</Text>
            <Text style={styles.notesText}>{note.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{t('deliveryNoteDetail', 'linesTitle')}</Text>
        <View style={{ gap: 12 }}>
          {note.lines.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{line.product_name ?? `#${line.product_id}`}</Text>
                {line.product_code && <Text style={styles.lineMeta}>{line.product_code}</Text>}
              </View>
              {isDraft ? (
                <View style={styles.qtyField}>
                  <TextField
                    label={t('deliveryNoteDetail', 'quantityLabel')}
                    keyboardType="decimal-pad"
                    value={quantities[line.id] ?? ''}
                    onChangeText={(v) => setQuantities((prev) => ({ ...prev, [line.id]: v }))}
                  />
                </View>
              ) : (
                <Text style={styles.lineQty}>
                  {line.quantity_delivered} {line.unit ?? ''}
                </Text>
              )}
            </View>
          ))}
        </View>

        {isDraft && (
          <Button onPress={handleSaveQuantities} isLoading={saving} variant="ghost" style={{ marginTop: 16, width: '100%' }}>
            {t('deliveryNoteDetail', 'saveQuantities')}
          </Button>
        )}

        {nextStatuses.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionTitle}>{t('deliveryNoteDetail', 'statusActionsTitle')}</Text>
            <StatusTransitionButtons
              nextStatuses={nextStatuses}
              reasonRequiredFor={DELIVERY_NOTE_STATUSES_REQUIRING_REASON}
              reasonLabel={t('deliveryNoteDetail', 'reasonLabel')}
              reasonRequiredError={t('deliveryNoteDetail', 'reasonRequiredError')}
              cancelLabel={t('common', 'cancel')}
              confirmLabel={t('common', 'confirm')}
              statusLabel={(s) => statusLabel(t, s as DeliveryNoteStatus)}
              busy={statusBusy}
              onChange={handleStatusChange}
            />
          </View>
        )}

        <Button onPress={handleDownloadPdf} isLoading={downloading} variant="ghost" style={{ marginTop: 16, width: '100%' }}>
          {t('deliveryNoteDetail', 'downloadPdf')}
        </Button>
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
  linkText: { color: colors.gold300 },

  noticeBox: {
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  noticeText: { fontFamily: fonts.sans, fontSize: 13, color: '#a7f3d0' },

  metaBox: { backgroundColor: whiteAlpha(0.04), borderRadius: 12, padding: 14, gap: 4, marginBottom: 18 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  metaLabel: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  metaValue: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.white },

  sectionTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginBottom: 10 },
  notesText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.7), lineHeight: 19 },

  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: whiteAlpha(0.06) },
  lineName: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.white },
  lineMeta: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45), marginTop: 2 },
  lineQty: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.gold300 },
  qtyField: { width: 110 },
});
