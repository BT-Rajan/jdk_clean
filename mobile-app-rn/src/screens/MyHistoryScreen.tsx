import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../components/Alert';
import { GlassCard } from '../components/GlassCard';
import { PageHeader } from '../components/PageHeader';
import { colors, fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
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

  return (
    <View style={styles.screen}>
      <PageHeader title={t('myHistory', 'title')} style={styles.pageHeader} />
      <Text style={styles.headerSubtitle}>{monthLabel}</Text>

      <Alert variant="error">{error}</Alert>

      <FlatList
        data={entries}
        keyExtractor={(item, i) => `${item.table_name}-${item.record_id}-${item.changed_at}-${i}`}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.gold400} />}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>{t('myHistory', 'emptyText')}</Text> : null}
        renderItem={({ item }) => (
          <GlassCard style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {tableLabel(t, item.table_name)} #{item.record_id}
              </Text>
              <Text style={styles.rowDesc}>{describeEntry(t, item)}</Text>
            </View>
            <Text style={styles.rowDate}>{formatDateTime(item.changed_at)}</Text>
          </GlassCard>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink950, padding: 18 },
  pageHeader: { marginBottom: 4 },
  headerSubtitle: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.45), marginBottom: 16 },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10, padding: 16 },
  rowTitle: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.white, marginBottom: 3 },
  rowDesc: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.6) },
  rowDate: { fontFamily: fonts.sans, fontSize: 11, color: whiteAlpha(0.4), flexShrink: 0 },
});
