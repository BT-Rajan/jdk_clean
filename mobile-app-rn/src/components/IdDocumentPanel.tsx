import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from './Alert';
import { Button } from './Button';
import { GlassCard } from './GlassCard';
import { colors, fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { PickedFile } from '../api/customers';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
// Mirrors frontend/src/components/documents/IdDocumentPicker.tsx's
// ID_DOCUMENT_MAX_BYTES.
export const ID_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

interface IdDocumentPanelProps {
  hasDocument: boolean;
  verified: boolean;
  verifiedAt: string | null;
  onUpload: (asset: PickedFile) => Promise<void>;
  onRemove: () => Promise<void>;
  onView: () => Promise<void>;
  onVerify: () => Promise<void>;
  onUnverify: () => Promise<void>;
}

/** Mirrors frontend/src/components/documents/IdDocumentPanel.tsx's
 * detail-page panel: view/replace/remove an entity's id document, and
 * mark it verified. Every actual API call is passed in by the caller. */
export function IdDocumentPanel({
  hasDocument,
  verified,
  verifiedAt,
  onUpload,
  onRemove,
  onView,
  onVerify,
  onUnverify,
}: IdDocumentPanelProps) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message ?? t('idDocument', 'genericError'));
    } finally {
      setBusy(false);
    }
  }

  async function handlePick() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: ALLOWED_TYPES, copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.mimeType && !ALLOWED_TYPES.includes(asset.mimeType)) {
      setError(t('idDocument', 'invalidTypeError'));
      return;
    }
    if (asset.size && asset.size > ID_DOCUMENT_MAX_BYTES) {
      setError(t('idDocument', 'tooLargeError'));
      return;
    }
    void withBusy(() => onUpload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, file: asset.file }));
  }

  return (
    <GlassCard strong style={styles.card}>
      <Alert variant="error">{error}</Alert>
      <Text style={styles.title}>{t('idDocument', 'title')}</Text>
      <Text style={styles.subtitle}>
        {hasDocument
          ? verified
            ? verifiedAt
              ? t('idDocument', 'verifiedStatusWithDate', { date: verifiedAt.slice(0, 10) })
              : t('idDocument', 'verifiedStatus')
            : t('idDocument', 'onFileStatus')
          : t('idDocument', 'noneStatus')}
      </Text>
      <View style={styles.actions}>
        {hasDocument && (
          <Button variant="ghost" size="sm" isLoading={busy} onPress={() => withBusy(onView)}>
            {t('idDocument', 'view')}
          </Button>
        )}
        <Button variant="ghost" size="sm" isLoading={busy} onPress={handlePick}>
          {hasDocument ? t('idDocument', 'replace') : t('idDocument', 'upload')}
        </Button>
        {hasDocument && (
          <Button variant="subtle" size="sm" isLoading={busy} onPress={() => withBusy(onRemove)}>
            {t('idDocument', 'remove')}
          </Button>
        )}
        {hasDocument && (
          <Button
            variant={verified ? 'subtle' : 'primary'}
            size="sm"
            isLoading={busy}
            onPress={() => withBusy(verified ? onUnverify : onVerify)}
          >
            {verified ? t('idDocument', 'unmarkVerified') : t('idDocument', 'markVerified')}
          </Button>
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20 },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.white, marginBottom: 4 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.55), marginBottom: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
