import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../components/Alert';
import { GlassCard } from '../components/GlassCard';
import { colors, fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { notify } from '../utils/alerts';
import { getMyHistory, MyHistoryEntry } from '../api/auth';

type LocaleT = ReturnType<typeof useLocale>['t'];

// Translated labels for the tables a sales-role mobile user can
// actually generate entries for (Quick Quote and Clients) -- anything
// else falls back to an untranslated but still-readable humanized
// table name, same spirit as other "unexpected status" fallbacks in
// this app rather than a hard error.
function tableLabel(t: LocaleT, tableName: string): string {
  switch (tableName) {
    case 'customers':
      return t('myHistory', 'tableCustomers');
    case 'quotations':
      return t('myHistory', 'tableQuotations');
    case 'feasibility_checks':
      return t('myHistory', 'tableFeasibilityChecks');
    case 'orders':
      return t('myHistory', 'tableOrders');
    default: {
      const words = tableName.replace(/_/g, ' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

// Mirrors frontend/src/components/history/HistoryTimeline.tsx's
// describeEntry, translated.
function describeEntry(t: LocaleT, entry: MyHistoryEntry): string {
  switch (entry.action) {
    case 'CREATE':
      return t('myHistory', 'created');
    case 'DELETE':
      return t('myHistory', 'deleted');
    case 'RESTORE':
      return t('myHistory', 'restored');
    case 'UPDATE': {
      const field = entry.field_name?.replace(/_/g, ' ') ?? t('myHistory', 'aField');
      if (entry.old_value === null && entry.new_value !== null) {
        return t('myHistory', 'setFieldTo', { field, value: entry.new_value });
      }
      if (entry.old_value !== null && entry.new_value === null) {
        return t('myHistory', 'clearedField', { field });
      }
      return t('myHistory', 'changedField', { field, old: entry.old_value ?? '', new: entry.new_value ?? '' });
    }
    default:
      return entry.action;
  }
}

function formatDateTime(iso: string): string {
  // No year -- every row on this screen is already known to be within
  // the one calendar month shown up top.
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function MyHistoryScreen() {
  const { t } = useLocale();
  const navigation = useNavigation<any>();
  const [entries, setEntries] = useState<MyHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `undefined` locale (not the app's own EN/AR toggle) -- same choice
  // DateField.tsx makes, so date formatting always follows the device/
  // browser's own locale rather than switching numeral systems etc.
  // out from under the rest of the app's Latin-numeral formatting.
  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyHistory();
      setEntries(res);
    } catch (err: any) {
      setError(err?.message ?? t('myHistory', 'loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Only 'customers' has a mobile screen to actually land on -- the
  // other tables (quotations, feasibility checks, orders) don't have a
  // detail screen in this app yet, so a tap on those rows says so the
  // same way an unbuilt Home tile does, rather than the row silently
  // doing nothing.
  function handlePress(item: MyHistoryEntry) {
    if (item.table_name === 'customers') {
      navigation.navigate('Clients', { screen: 'ClientForm', params: { customerId: item.record_id } });
      return;
    }
    notify(`${tableLabel(t, item.table_name)} #${item.record_id}`, t('common', 'comingSoon'));
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.headerTitle}>{t('myHistory', 'title')}</Text>
      <Text style={styles.headerSubtitle}>{monthLabel}</Text>

      <Alert variant="error">{error}</Alert>

      <FlatList
        data={entries}
        keyExtractor={(item, i) => `${item.table_name}-${item.record_id}-${item.changed_at}-${i}`}
        style={{ flex: 1 }}
        contentContainerStyle={entries.length === 0 ? styles.listContentEmpty : styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.gold400} />}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>{t('myHistory', 'emptyText')}</Text> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => handlePress(item)}>
            <GlassCard style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {tableLabel(t, item.table_name)} #{item.record_id}
                </Text>
                <Text style={styles.rowDesc}>{describeEntry(t, item)}</Text>
                <Text style={styles.rowDate}>{formatDateTime(item.changed_at)}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={whiteAlpha(0.3)} />
            </GlassCard>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18 },
  headerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.white },
  headerSubtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.45), marginBottom: 16 },
  listContent: { paddingTop: 8, paddingBottom: 24 },
  // When there's nothing to show, let the empty-state message center in
  // the remaining space instead of sitting in a thin band right under
  // the header with the rest of the screen left blank.
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, padding: 16 },
  rowTitle: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.white, marginBottom: 3 },
  rowDesc: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.6), marginBottom: 3 },
  rowDate: { fontFamily: fonts.sans, fontSize: 11, color: whiteAlpha(0.4) },
});
