import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { GlassCard } from '../components/GlassCard';
import { colors, fonts, whiteAlpha } from '../theme';

export function AccountScreen() {
  const { logout, username } = useAuth();

  return (
    <View style={styles.screen}>
      <GlassCard strong style={styles.card}>
        <Text style={styles.title}>Account</Text>
        {username ? <Text style={styles.subtitle}>Signed in as {username}</Text> : null}
        <Button variant="danger" onPress={logout} style={styles.logoutBtn}>
          Log out
        </Button>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18, justifyContent: 'flex-start' },
  card: { padding: 24, marginTop: 12 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.white, marginBottom: 6 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.5), marginBottom: 20 },
  logoutBtn: { width: '100%' },
});
