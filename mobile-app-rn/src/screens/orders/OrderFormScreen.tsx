import { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { DateField } from '../../components/DateField';
import { GlassCard } from '../../components/GlassCard';
import { SelectField, SelectOption } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { colors, fonts, whiteAlpha } from '../../theme';
import { useLocale } from '../../i18n/LocaleContext';
import { toIsoDate } from '../../utils/format';
import { listCustomers, Customer } from '../../api/customers';
import { listProducts, Product } from '../../api/catalog';
import { createOrder, getOrder, updateOrder, OrderLineInput } from '../../api/orders';
import { OrdersStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<OrdersStackParamList, 'OrderForm'>;

interface LineDraft {
  key: string;
  productId: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
}

let keySeq = 0;
function newLine(): LineDraft {
  keySeq += 1;
  return { key: `l${keySeq}`, productId: null, quantity: '', unitPrice: '', discountPercent: '0' };
}

export function OrderFormScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const orderId = route.params?.orderId;
  const isEditing = Boolean(orderId);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState<Date>(new Date());
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? t('orderForm', 'editTitle') : t('orderForm', 'newTitle') });
    (async () => {
      try {
        const [c, p] = await Promise.all([listCustomers({ page_size: 200 }), listProducts()]);
        setCustomers(c.items);
        setProducts(p.items);
      } catch (err: any) {
        setError(err?.message ?? t('orderForm', 'loadError'));
      }
      if (orderId) {
        try {
          const order = await getOrder(orderId);
          setCustomerId(String(order.customer_id));
          setOrderDate(new Date(order.order_date));
          setDeliveryDate(order.requested_delivery_date ? new Date(order.requested_delivery_date) : null);
          setNotes(order.notes ?? '');
          setDiscountPercent(String(order.discount_percent ?? 0));
          setLines(
            order.lines.map((l) => {
              keySeq += 1;
              return {
                key: `l${keySeq}`,
                productId: String(l.product_id),
                quantity: String(l.quantity),
                unitPrice: String(l.unit_price),
                discountPercent: String(l.discount_percent ?? 0),
              };
            }),
          );
        } catch (err: any) {
          setError(err?.message ?? t('orderForm', 'loadError'));
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [orderId]);

  const customerOptions: SelectOption[] = customers.map((c) => ({ label: c.name, value: String(c.id) }));
  const productOptions: SelectOption[] = products.map((p) => ({
    label: p.code ? `${p.name} (${p.code})` : p.name,
    value: String(p.id),
  }));

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function handleProductChange(key: string, productId: string) {
    const product = products.find((p) => String(p.id) === productId);
    updateLine(key, { productId, unitPrice: product ? String(product.selling_price) : '' });
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleSave() {
    setError(null);
    if (!customerId) return setError(t('orderForm', 'selectClientError'));

    const parsedLines: OrderLineInput[] = [];
    for (const line of lines) {
      if (!line.productId) return setError(t('orderForm', 'selectProductError'));
      const qty = parseFloat(line.quantity);
      if (!qty || qty <= 0) return setError(t('orderForm', 'invalidQuantityError'));
      const unitPrice = parseFloat(line.unitPrice);
      if (Number.isNaN(unitPrice) || unitPrice < 0) return setError(t('orderForm', 'invalidPriceError'));
      const disc = parseFloat(line.discountPercent) || 0;
      parsedLines.push({ product_id: Number(line.productId), quantity: qty, unit_price: unitPrice, discount_percent: disc });
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: Number(customerId),
        order_date: toIsoDate(orderDate),
        requested_delivery_date: deliveryDate ? toIsoDate(deliveryDate) : null,
        notes: notes.trim() || null,
        discount_percent: parseFloat(discountPercent) || 0,
        lines: parsedLines,
      };
      const order = isEditing ? await updateOrder(orderId!, payload) : await createOrder(payload);
      navigation.replace('OrderDetail', { orderId: order.id });
    } catch (err: any) {
      setError(err?.message ?? t('orderForm', 'saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loadingText}>{t('common', 'loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <GlassCard strong style={styles.card}>
        <Alert variant="error">{error}</Alert>

        <View style={{ gap: 18 }}>
          <SelectField
            label={t('orderForm', 'clientLabel')}
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder={customers.length ? t('orderForm', 'clientPlaceholderLoaded') : t('orderForm', 'clientPlaceholderLoading')}
          />

          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <DateField label={t('orderForm', 'orderDateLabel')} value={orderDate} onChange={setOrderDate} />
            </View>
            <View style={{ flex: 1 }}>
              <DateField
                label={t('orderForm', 'deliveryDateLabel')}
                value={deliveryDate}
                onChange={setDeliveryDate}
                minimumDate={new Date()}
              />
            </View>
          </View>

          <View style={{ gap: 14 }}>
            <Text style={styles.sectionTitle}>{t('orderForm', 'linesTitle')}</Text>
            {lines.map((line, index) => (
              <View key={line.key} style={styles.lineRow}>
                <View style={{ flex: 1, gap: 10 }}>
                  <SelectField
                    label={`${t('orderForm', 'productLabel')} ${index + 1}`}
                    value={line.productId}
                    onChange={(v) => handleProductChange(line.key, v)}
                    options={productOptions}
                    placeholder={t('orderForm', 'productPlaceholder')}
                  />
                  <View style={styles.rowFields}>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label={t('orderForm', 'quantityLabel')}
                        keyboardType="decimal-pad"
                        value={line.quantity}
                        onChangeText={(v) => updateLine(line.key, { quantity: v })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label={t('orderForm', 'unitPriceLabel')}
                        keyboardType="decimal-pad"
                        value={line.unitPrice}
                        onChangeText={(v) => updateLine(line.key, { unitPrice: v })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextField
                        label={t('orderForm', 'discountLabel')}
                        keyboardType="decimal-pad"
                        value={line.discountPercent}
                        onChangeText={(v) => updateLine(line.key, { discountPercent: v })}
                      />
                    </View>
                  </View>
                </View>
                {lines.length > 1 && (
                  <Pressable onPress={() => removeLine(line.key)} hitSlop={10} style={styles.removeLineBtn}>
                    <Feather name="trash-2" size={16} color={colors.red400} />
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable onPress={addLine} style={styles.addLineBtn}>
              <Feather name="plus" size={14} color={colors.gold300} />
              <Text style={styles.addLineText}>{t('orderForm', 'addLine')}</Text>
            </Pressable>
          </View>

          <TextField
            label={t('orderForm', 'discountPercentLabel')}
            keyboardType="decimal-pad"
            value={discountPercent}
            onChangeText={setDiscountPercent}
          />

          <TextField
            label={t('orderForm', 'notesLabel')}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
          />
        </View>

        <Button onPress={handleSave} isLoading={saving} style={styles.saveBtn}>
          {isEditing ? t('orderForm', 'saveChanges') : t('orderForm', 'createOrder')}
        </Button>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  loadingText: { fontFamily: fonts.sans, color: whiteAlpha(0.5), textAlign: 'center', marginTop: 40 },
  card: { padding: 22 },
  rowFields: { flexDirection: 'row', gap: 10 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  removeLineBtn: { padding: 10, marginTop: 26 },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  addLineText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.gold300 },
  saveBtn: { marginTop: 24, width: '100%' },
});
