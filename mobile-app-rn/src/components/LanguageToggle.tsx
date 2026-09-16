import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Locale } from '../i18n/translations';
import { colors, fonts, whiteAlpha } from '../theme';

/** The EN/AR pill switch -- shown on the login screen (so a person can
 * read the login form itself in their language before signing in) and
 * in the drawer (so it stays reachable once inside the app, not just at
 * login). */
export function LanguageToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      <ToggleOption label="EN" fullName="English" active={locale === 'en'} onPress={() => onChange('en')} />
      <ToggleOption label="AR" fullName="Arabic" active={locale === 'ar'} onPress={() => onChange('ar')} />
    </View>
  );
}

function ToggleOption({
  label,
  fullName,
  active,
  onPress,
}: {
  label: string;
  fullName: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={fullName}
      accessibilityState={{ selected: active, checked: active }}
      style={[styles.option, active && styles.optionActive]}
    >
      <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    width: 76,
    borderRadius: 999,
    backgroundColor: whiteAlpha(0.06),
    borderWidth: 1,
    borderColor: whiteAlpha(0.12),
    padding: 3,
  },
  option: { flex: 1, borderRadius: 999, paddingVertical: 5, alignItems: 'center' },
  optionActive: { backgroundColor: colors.gold400 },
  optionText: { fontFamily: fonts.sansSemibold, fontSize: 11, color: whiteAlpha(0.55) },
  optionTextActive: { color: colors.ink950 },
});
