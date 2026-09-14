import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, glass, radii, whiteAlpha } from '../theme';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  searchable?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  error,
  searchable = true,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = options.find((o) => o.value === value)?.label;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.box, glass.inset, Boolean(error) && styles.boxError]}
      >
        <Text style={[styles.valueText, !selectedLabel && styles.placeholderText]} numberOfLines={1}>
          {selectedLabel ?? placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{label}</Text>

          {searchable && (
            <View style={[styles.searchBox, glass.inset]}>
              <TextInput
                placeholder="Search…"
                placeholderTextColor={whiteAlpha(0.3)}
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
                autoFocus
              />
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.value);
                  setQuery('');
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.optionRow,
                  item.value === value && styles.optionRowActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.optionText, item.value === value && styles.optionTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No matches.</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  label: {
    marginBottom: 6,
    fontSize: 11,
    fontFamily: fonts.sansMedium,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: whiteAlpha(0.55),
  },
  box: {
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boxError: { borderColor: `${colors.red400}80` },
  valueText: { fontFamily: fonts.sans, fontSize: 15, color: colors.white, flex: 1 },
  placeholderText: { color: whiteAlpha(0.3) },
  chevron: { color: whiteAlpha(0.4), marginLeft: 8 },
  errorText: { marginTop: 6, fontSize: 12, fontFamily: fonts.sans, color: colors.red400 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.ink900,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: whiteAlpha(0.12),
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '75%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: whiteAlpha(0.2),
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.white,
    marginBottom: 14,
  },
  searchBox: { borderRadius: radii.xl, paddingHorizontal: 14, height: 42, marginBottom: 10, justifyContent: 'center' },
  searchInput: { fontFamily: fonts.sans, fontSize: 14, color: colors.white, padding: 0 },
  optionRow: { paddingVertical: 13, paddingHorizontal: 6, borderRadius: radii.md },
  optionRowActive: { backgroundColor: whiteAlpha(0.08) },
  optionText: { fontFamily: fonts.sans, fontSize: 15, color: whiteAlpha(0.85) },
  optionTextActive: { color: colors.gold300, fontFamily: fonts.sansMedium },
  emptyText: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.4), paddingVertical: 20, textAlign: 'center' },
});
