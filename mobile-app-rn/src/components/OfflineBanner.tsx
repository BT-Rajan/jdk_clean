import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useLocale } from '../i18n/LocaleContext';
import { fonts } from '../theme';

/** Sits above the whole navigator (see App.tsx) so it's visible on every
 * screen, including the login screen -- before this, a dead connection
 * just meant every individual screen quietly errored with no app-wide
 * signal that the *device*, not that one request, was the problem. */
export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: '#7f1d1d' }}>
      <View style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: '#fecaca', textAlign: 'center' }}>
          {t('offline', 'banner')}
        </Text>
      </View>
    </View>
  );
}
