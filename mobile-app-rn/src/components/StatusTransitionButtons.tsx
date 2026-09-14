import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors, fonts, radii, whiteAlpha } from '../theme';

interface StatusTransitionButtonsProps<S extends string> {
  /** Statuses reachable from the current one. */
  nextStatuses: S[];
  /** Which of those targets require a reason before the transition fires. */
  reasonRequiredFor: S[];
  reasonLabel: string;
  reasonRequiredError: string;
  cancelLabel: string;
  confirmLabel: string;
  /** Translated label for a given status key. */
  statusLabel: (status: S) => string;
  onChange: (status: S, reason?: string) => Promise<void>;
  busy?: boolean;
}

/** Mirrors frontend/src/components/status/StatusTransitionButtons.tsx --
 * a button per reachable status; ones in reasonRequiredFor open a small
 * sheet to collect the reason first, everything else fires immediately. */
export function StatusTransitionButtons<S extends string>({
  nextStatuses,
  reasonRequiredFor,
  reasonLabel,
  reasonRequiredError,
  cancelLabel,
  confirmLabel,
  statusLabel,
  onChange,
  busy = false,
}: StatusTransitionButtonsProps<S>) {
  const [pendingStatus, setPendingStatus] = useState<S | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handlePress(status: S) {
    if (reasonRequiredFor.includes(status)) {
      setPendingStatus(status);
      setReason('');
      setReasonError(null);
      return;
    }
    void onChange(status);
  }

  async function handleConfirmReason() {
    if (!reason.trim()) {
      setReasonError(reasonRequiredError);
      return;
    }
    if (pendingStatus === null) return;
    setSubmitting(true);
    try {
      await onChange(pendingStatus, reason.trim());
      setPendingStatus(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <View style={styles.row}>
        {nextStatuses.map((s) => (
          <Button key={s} variant="ghost" size="sm" isLoading={busy} onPress={() => handlePress(s)}>
            {statusLabel(s)}
          </Button>
        ))}
      </View>

      <Modal visible={pendingStatus !== null} animationType="slide" transparent onRequestClose={() => setPendingStatus(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPendingStatus(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{pendingStatus ? statusLabel(pendingStatus) : ''}</Text>
          <TextField
            label={reasonLabel}
            value={reason}
            onChangeText={(v) => {
              setReason(v);
              if (reasonError) setReasonError(null);
            }}
            error={reasonError ?? undefined}
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
          />
          <View style={styles.actions}>
            <Button variant="ghost" onPress={() => setPendingStatus(null)} style={{ flex: 1 }}>
              {cancelLabel}
            </Button>
            <Button isLoading={submitting} onPress={handleConfirmReason} style={{ flex: 1 }}>
              {confirmLabel}
            </Button>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    gap: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: whiteAlpha(0.2),
    marginBottom: 4,
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.white, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
