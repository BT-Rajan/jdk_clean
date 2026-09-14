import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, whiteAlpha } from '../theme';

type Tone = 'neutral' | 'gold' | 'success' | 'danger';

// Mirrors frontend/src/components/ui/Badge.tsx's STATUS_TONES, limited
// to the statuses this app actually shows (customer status + onboarding
// status) -- keeps status colors meaning the same thing across web and
// mobile (active/confirmed-style green, pending/neutral grey, danger red).
const STATUS_TONES: Record<string, Tone> = {
  active: 'success',
  inactive: 'neutral',
  pending: 'neutral',
  under_review: 'gold',
  on_hold: 'danger',
  rejected: 'danger',
};

const TONE_STYLES: Record<Tone, { bg: string; border: string; text: string }> = {
  neutral: { bg: whiteAlpha(0.05), border: whiteAlpha(0.15), text: whiteAlpha(0.6) },
  gold: { bg: 'rgba(212,175,106,0.1)', border: 'rgba(212,175,106,0.3)', text: colors.gold200 },
  success: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(52,211,153,0.3)', text: colors.emerald200 },
  danger: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(248,113,113,0.3)', text: colors.red200 },
};

// `status` picks the color, `label` is the already-translated text --
// kept separate since the status keys themselves (e.g. 'under_review')
// aren't user-facing strings.
export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  const t = TONE_STYLES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontFamily: fonts.sansMedium, fontSize: 12 },
});
