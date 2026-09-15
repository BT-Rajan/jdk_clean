import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { GlassCard } from '../components/GlassCard';
import { LanguageToggle } from '../components/LanguageToggle';
import { Logo } from '../components/Logo';
import { TextField } from '../components/TextField';
import { colors, fonts, whiteAlpha } from '../theme';

export function LoginScreen() {
  const { login } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!username.trim() || !password) {
      setError(t('login', 'fillRequired'));
      return;
    }
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? t('login', 'failed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.topRow}>
            <View style={{ width: 76 }} />
            <View style={styles.logoWrap}>
              <Logo size={44} />
            </View>
            <LanguageToggle locale={locale} onChange={setLocale} />
          </View>

          <GlassCard strong style={styles.card}>
            <Text style={styles.title}>{t('login', 'title')}</Text>
            <Text style={styles.subtitle}>{t('login', 'subtitle')}</Text>

            <Alert variant="error">{error}</Alert>

            <View style={{ gap: 18 }}>
              <TextField
                label={t('login', 'username')}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                editable={!isSubmitting}
                returnKeyType="next"
              />
              <TextField
                label={t('login', 'password')}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!isSubmitting}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
            </View>

            <Button onPress={handleSubmit} isLoading={isSubmitting} style={styles.submitBtn}>
              {t('login', 'signIn')}
            </Button>

            <Text style={styles.footnote}>{t('login', 'forgotHint')}</Text>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  logoWrap: { alignItems: 'center' },
  card: { padding: 26 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.white, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.5), marginBottom: 20 },
  submitBtn: { marginTop: 26, width: '100%' },
  footnote: {
    marginTop: 18,
    textAlign: 'center',
    fontFamily: fonts.sans,
    fontSize: 11,
    color: whiteAlpha(0.4),
  },
});
