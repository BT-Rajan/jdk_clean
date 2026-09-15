import { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { DateField } from '../../components/DateField';
import { GlassCard } from '../../components/GlassCard';
import { TextField } from '../../components/TextField';
import { colors, fonts, whiteAlpha } from '../../theme';
import { useLocale } from '../../i18n/LocaleContext';
import { toIsoDate } from '../../utils/format';
import { createDeliveryNote } from '../../api/deliveryNotes';
import { OrdersStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<OrdersStackParamList, 'DeliveryNoteForm'>;

// Lines are deliberately not collected here -- the backend auto-populates
// them from whatever's still outstanding on the order (see
// delivery_note_service.create_delivery_note), and they can be adjusted
// afterward on the note's own detail screen while it's still draft.
export function DeliveryNoteFormScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { orderId, orderNumber } = route.params;

  const [deliveryDate, setDeliveryDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setSaving(true);
    try {
      const note = await createDeliveryNote({
        order_id: orderId,
        delivery_date: toIsoDate(deliveryDate),
        notes: notes.trim() || null,
      });
      navigation.replace('DeliveryNoteDetail', { deliveryNoteId: note.id });
    } catch (err: any) {
      setError(err?.message ?? t('deliveryNoteForm', 'saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <GlassCard strong style={styles.card}>
        <Alert variant="error">{error}</Alert>

        <View style={{ gap: 18 }}>
          <View>
            <Text style={styles.metaLabel}>{t('deliveryNoteForm', 'orderLabel')}</Text>
            <Text style={styles.metaValue}>{orderNumber}</Text>
          </View>

          <DateField
            label={t('deliveryNoteForm', 'deliveryDateLabel')}
            value={deliveryDate}
            onChange={setDeliveryDate}
            minimumDate={new Date()}
          />

          <TextField
            label={t('deliveryNoteForm', 'notesLabel')}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
          />

          <Text style={styles.hint}>{t('deliveryNoteForm', 'linesHint')}</Text>
        </View>

        <Button onPress={handleCreate} isLoading={saving} style={styles.saveBtn}>
          {t('deliveryNoteForm', 'createButton')}
        </Button>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  card: { padding: 22 },
  metaLabel: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  metaValue: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.white, marginTop: 2 },
  hint: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.4), lineHeight: 17 },
  saveBtn: { marginTop: 24, width: '100%' },
});
