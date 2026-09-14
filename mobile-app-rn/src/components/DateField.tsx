import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, fonts, glass, radii, whiteAlpha } from '../theme';

interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  error?: string;
  hint?: string;
}

/** Quick-pick shortcuts covering the lead times a sales rep actually
 * hears from customers most often ("need it today", "by next week"),
 * so the common case is one tap instead of a full date-picker round
 * trip. Picking a chip commits immediately -- no separate "Done" step. */
const QUICK_PICKS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In 1 week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
];

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function DateField({ label, value, onChange, minimumDate, error, hint }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? minimumDate ?? new Date());
  const today = startOfDay(minimumDate ?? new Date());

  function openPicker() {
    setDraft(value ?? today);
    setOpen(true);
  }

  function commit(date: Date) {
    onChange(startOfDay(date));
    setOpen(false);
  }

  function handleQuickPick(days: number) {
    commit(addDays(today, days));
  }

  // Android's picker is a native OS dialog -- most familiar to Android
  // users, so it renders itself (no custom sheet needed) and reports
  // back through onChange, which itself signals dismissal/cancel.
  function handleAndroidChange(event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (event.type === 'set' && selected) commit(selected);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={openPicker} style={[styles.box, glass.inset, Boolean(error) && styles.boxError]}>
        <Text style={[styles.valueText, !value && styles.placeholderText]}>
          {value ? formatDisplay(value) : 'Select a date…'}
        </Text>
        <Text style={styles.calendarIcon}>📅</Text>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}

      {open && Platform.OS === 'android' && (
        <DateTimePicker value={draft} mode="date" minimumDate={today} onChange={handleAndroidChange} />
      )}

      {Platform.OS !== 'android' && (
        <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{label}</Text>

            <View style={styles.chipsRow}>
              {QUICK_PICKS.map((qp) => (
                <Pressable
                  key={qp.label}
                  onPress={() => handleQuickPick(qp.days)}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.chipText}>{qp.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={draft}
                mode="date"
                display="inline"
                minimumDate={today}
                themeVariant="dark"
                accentColor={colors.gold400}
                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                  if (selected) setDraft(selected);
                }}
              />
            </View>

            <Pressable style={styles.confirmBtn} onPress={() => commit(draft)}>
              <Text style={styles.confirmBtnText}>Use {formatDisplay(draft)}</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  label: {
    marginBottom: 6,
    fontSize: 11,
    fontFamily: fonts.sansMedium,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: whiteAlpha(0.55),
  },
  box: {
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boxError: { borderColor: `${colors.red400}80` },
  valueText: { fontFamily: fonts.sans, fontSize: 15, color: colors.white },
  placeholderText: { color: whiteAlpha(0.3) },
  calendarIcon: { fontSize: 15, marginLeft: 8 },
  errorText: { marginTop: 6, fontSize: 12, fontFamily: fonts.sans, color: colors.red400 },
  hintText: { marginTop: 6, fontSize: 12, fontFamily: fonts.sans, color: whiteAlpha(0.4) },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.ink900,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: whiteAlpha(0.12),
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: whiteAlpha(0.2),
    marginBottom: 14,
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.white, marginBottom: 14 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: whiteAlpha(0.06),
    borderWidth: 1,
    borderColor: whiteAlpha(0.1),
  },
  chipPressed: { backgroundColor: whiteAlpha(0.12) },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.gold200 },

  pickerWrap: { alignItems: 'center', marginBottom: 10 },

  confirmBtn: {
    marginTop: 6,
    height: 48,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold400,
  },
  confirmBtnText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink950 },
});
