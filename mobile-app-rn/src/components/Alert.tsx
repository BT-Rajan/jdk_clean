import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '../theme';

type AlertVariant = 'error' | 'success' | 'info';

const variantStyles: Record<AlertVariant, { bg: string; border: string; text: string }> = {
  error: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(248,113,113,0.3)', text: colors.red200 },
  success: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(52,211,153,0.3)', text: colors.emerald200 },
  info: { bg: 'rgba(14,165,233,0.1)', border: 'rgba(56,189,248,0.3)', text: colors.sky200 },
};

export function Alert({ variant = 'error', children }: { variant?: AlertVariant; children?: string | null }) {
  if (!children) return null;
  const v = variantStyles[variant];
  return (
    <View style={[styles.box, { backgroundColor: v.bg, borderColor: v.border }]}>
      <Text style={[styles.text, { color: v.text }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  text: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
});
