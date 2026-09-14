import { StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Button } from './Button';
import { fonts, glass, radii, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { PickedFile } from '../api/customers';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const ID_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

interface IdDocumentPickerFieldProps {
  label: string;
  hint?: string;
  value: PickedFile | null;
  onChange: (asset: PickedFile | null) => void;
  error?: string | null;
  onError?: (message: string | null) => void;
}

/** Mirrors frontend/src/components/documents/IdDocumentPicker.tsx: local
 * file selection for an id document -- used in the "New client" wizard,
 * where the customer doesn't exist yet so the actual upload has to wait
 * until after creation (see ClientFormScreen). Purely presentational,
 * same as the web version: validates type/size and hands the chosen
 * file up to the caller. */
export function IdDocumentPickerField({ label, hint, value, onChange, error, onError }: IdDocumentPickerFieldProps) {
  const { t } = useLocale();

  async function handlePick() {
    const result = await DocumentPicker.getDocumentAsync({ type: ALLOWED_TYPES, copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.mimeType && !ALLOWED_TYPES.includes(asset.mimeType)) {
      onError?.(t('idDocument', 'invalidTypeError'));
      return;
    }
    if (asset.size && asset.size > ID_DOCUMENT_MAX_BYTES) {
      onError?.(t('idDocument', 'tooLargeError'));
      return;
    }
    onError?.(null);
    onChange({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, file: asset.file });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, glass.inset]}>
        <Button variant="ghost" size="sm" onPress={handlePick}>
          {value ? t('idDocument', 'replace') : t('idDocument', 'upload')}
        </Button>
        <Text style={styles.fileText} numberOfLines={1}>
          {value ? value.name : t('idDocument', 'noneStatus')}
        </Text>
        {value && (
          <Button variant="subtle" size="sm" onPress={() => onChange(null)}>
            {t('idDocument', 'remove')}
          </Button>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  fileText: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.6), minWidth: 80 },
  errorText: { marginTop: 6, fontSize: 12, fontFamily: fonts.sans, color: '#f87171' },
  hintText: { marginTop: 6, fontSize: 12, fontFamily: fonts.sans, color: whiteAlpha(0.4) },
});
