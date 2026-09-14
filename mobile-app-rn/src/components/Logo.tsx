import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL } from '../api/client';
import { colors, fonts } from '../theme';

// Same unauthenticated endpoint the web app's Logo.tsx uses --
// app/api/settings.py's get_active_company_logo needs no auth token,
// so this can render before any login happens.
const ACTIVE_LOGO_URL = `${API_BASE_URL}/api/settings/logo/active/current`;

export function Logo({ size = 40 }: { size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <Image
        source={{ uri: ACTIVE_LOGO_URL }}
        style={{ width: size, height: size, resizeMode: 'contain' }}
        onError={() => setFailed(true)}
      />
    );
  }

  // Fallback wordmark -- RN has no CSS gradient-text primitive without
  // an extra masking dependency, so this uses a flat gold rather than
  // the web app's gold gradient clip. Visually close, not pixel-exact.
  return (
    <View style={styles.fallbackRow}>
      <View style={[styles.glyph, { width: size * 0.85, height: size * 0.85 }]}>
        <Text style={[styles.glyphMark, { fontSize: size * 0.4 }]}>◈</Text>
      </View>
      <Text style={styles.wordmark}>
        JDK <Text style={{ color: colors.gold400 }}>MEA</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  glyph: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.gold400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphMark: { color: colors.gold400 },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.white,
    letterSpacing: 0.3,
  },
});
