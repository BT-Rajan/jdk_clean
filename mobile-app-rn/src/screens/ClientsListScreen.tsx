import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { GlassCard } from '../components/GlassCard';
import { PageHeader } from '../components/PageHeader';
import { TextField } from '../components/TextField';
import { colors, fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { confirm } from '../utils/alerts';
import { listCustomers, activateCustomer, deactivateCustomer, Customer } from '../api/customers';
import { ClientsStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/roles';

type Props = NativeStackScreenProps<ClientsStackParamList, 'ClientsList'>;

export function ClientsListScreen({ navigation }: Props) {
  const { t } = useLocale();
  const { user } = useAuth();
  const allowAdmin = isAdmin(user?.role);
  const [clients, setClients] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCustomers({ search: searchTerm ?? undefined, page_size: 100 });
      setClients(res.items);
    } catch (err: any) {
      setError(err?.message ?? t('clients', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload every time this screen regains focus, so a create/edit on
  // ClientFormScreen is reflected immediately on the way back.
  useFocusEffect(
    useCallback(() => {
      load(search);
    }, [load]),
  );

  async function handleToggleStatus(client: Customer) {
    const activating = client.status === 'inactive';
    if (activating) {
      runToggle(client);
      return;
    }
    const proceed = await confirm(
      t('clients', 'disableTitle'),
      t('clients', 'disableMessage', { name: client.name }),
      t('clients', 'disableConfirm'),
      t('common', 'cancel'),
      { destructive: true },
    );
    if (proceed) runToggle(client);
  }

  async function runToggle(client: Customer) {
    setError(null);
    setTogglingId(client.id);
    try {
      const updated = client.status === 'active' ? await deactivateCustomer(client.id) : await activateCustomer(client.id);
      setClients((prev) => prev.map((c) => (c.id === client.id ? updated : c)));
    } catch (err: any) {
      setError(err?.message ?? t('clients', 'updateError'));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <PageHeader
        title={t('clients', 'title')}
        action={
          <Button size="sm" onPress={() => navigation.navigate('ClientForm', {})}>
            {t('clients', 'newButton')}
          </Button>
        }
      />

      <View style={styles.searchWrap}>
        <TextField
          label={t('clients', 'searchLabel')}
          value={search}
          onChangeText={setSearch}
          placeholder={t('clients', 'searchPlaceholder')}
          onSubmitEditing={() => load(search)}
          returnKeyType="search"
        />
      </View>

      <Alert variant="error">{error}</Alert>

      <FlatList
        data={clients}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(search)} tintColor={colors.gold400} />}
        ListEmptyComponent={
          !loading ? <Text style={styles.emptyText}>{t('clients', 'emptyText')}</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('ClientHistory', { customerId: item.id, customerName: item.name })}
          >
            <GlassCard style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.customer_number} · {item.customer_type}
                  {item.city ? ` · ${item.city}` : ''}
                </Text>
              </View>

              <View style={[styles.statusBadge, item.status === 'active' ? styles.badgeActive : styles.badgeInactive]}>
                <Text
                  style={[
                    styles.statusText,
                    item.status === 'active' ? styles.badgeActiveText : styles.badgeInactiveText,
                  ]}
                >
                  {item.status === 'active' ? t('clientForm', 'statusActive') : t('clientForm', 'statusInactive')}
                </Text>
              </View>

              {allowAdmin && (
                <Pressable
                  onPress={() => navigation.navigate('ClientForm', { customerId: item.id })}
                  hitSlop={10}
                  style={styles.iconBtn}
                >
                  <Feather name="edit-2" size={16} color={whiteAlpha(0.7)} />
                </Pressable>
              )}

              {allowAdmin && (
                <Pressable
                  onPress={() => handleToggleStatus(item)}
                  disabled={togglingId === item.id}
                  hitSlop={10}
                  style={styles.iconBtn}
                >
                  <Feather
                    name={item.status === 'active' ? 'slash' : 'check-circle'}
                    size={16}
                    color={item.status === 'active' ? colors.red400 : colors.emerald400}
                  />
                </Pressable>
              )}
            </GlassCard>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18 },
  searchWrap: { marginBottom: 12 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 16 },
  rowName: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.white, marginBottom: 3 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.45) },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 10 },
  badgeActive: { backgroundColor: 'rgba(16,185,129,0.15)' },
  badgeInactive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  badgeActiveText: { color: colors.emerald400 },
  badgeInactiveText: { color: whiteAlpha(0.5) },
  iconBtn: { marginLeft: 14, padding: 4 },
});
