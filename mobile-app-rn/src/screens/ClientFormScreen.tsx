import { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert as RNAlert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { GlassCard } from '../components/GlassCard';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { colors, fonts, whiteAlpha } from '../theme';
import {
  Customer,
  createCustomer,
  deleteCustomer,
  getCustomer,
  updateCustomer,
} from '../api/customers';
import { ClientsStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<ClientsStackParamList, 'ClientForm'>;

interface FormState {
  customer_type: 'individual' | 'business';
  name: string;
  code: string;
  contact_person: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  billing_address: string;
  shipping_address: string;
  nature_of_business: string;
  credit_limit: string;
  payment_terms_days: string;
  status: 'active' | 'inactive';
  notes: string;
}

const emptyForm: FormState = {
  customer_type: 'business',
  name: '',
  code: '',
  contact_person: '',
  email: '',
  phone: '',
  city: '',
  country: '',
  billing_address: '',
  shipping_address: '',
  nature_of_business: '',
  credit_limit: '0',
  payment_terms_days: '30',
  status: 'active',
  notes: '',
};

export function ClientFormScreen({ route, navigation }: Props) {
  const customerId = route.params?.customerId;
  const isEditing = Boolean(customerId);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Edit client' : 'New client' });
    if (!customerId) return;
    (async () => {
      try {
        const c = await getCustomer(customerId);
        setForm(customerToForm(c));
      } catch (err: any) {
        setError(err?.message ?? 'Could not load this client.');
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!isEditing && !form.name.trim()) errs.name = 'Name is required.';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email.';
    const credit = Number(form.credit_limit);
    if (form.credit_limit && (Number.isNaN(credit) || credit < 0)) errs.credit_limit = 'Must be 0 or more.';
    const terms = Number(form.payment_terms_days);
    if (form.payment_terms_days && (Number.isNaN(terms) || terms < 0)) errs.payment_terms_days = 'Must be 0 or more.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    setError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEditing && customerId) {
        // name/customer_type are deliberately not sent on update -- the
        // backend locks both after creation (see CustomerUpdate).
        await updateCustomer(customerId, formToUpdatePayload(form));
      } else {
        await createCustomer(formToCreatePayload(form));
      }
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message ?? 'Could not save this client.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!customerId) return;
    RNAlert.alert('Delete client', `Remove ${form.name}? This can be restored later if needed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteCustomer(customerId);
            navigation.goBack();
          } catch (err: any) {
            setError(err?.message ?? 'Could not delete this client.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <GlassCard strong style={styles.card}>
        <Alert variant="error">{error}</Alert>

        <View style={{ gap: 18 }}>
          <SelectField
            label="Customer type"
            value={form.customer_type}
            onChange={(v) => update('customer_type', v as FormState['customer_type'])}
            options={[
              { label: 'Business', value: 'business' },
              { label: 'Individual', value: 'individual' },
            ]}
            searchable={false}
          />

          <TextField
            label="Name"
            value={form.name}
            onChangeText={(v) => update('name', v)}
            error={fieldErrors.name}
            editable={!isEditing}
            hint={isEditing ? 'Locked after creation.' : undefined}
          />

          <TextField
            label="Civil ID / registration code"
            value={form.code}
            onChangeText={(v) => update('code', v)}
            placeholder="Leave blank for a prospective client"
          />

          <TextField label="Contact person" value={form.contact_person} onChangeText={(v) => update('contact_person', v)} />

          <TextField
            label="Email"
            value={form.email}
            onChangeText={(v) => update('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            error={fieldErrors.email}
          />

          <TextField label="Phone" value={form.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" />

          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <TextField label="City" value={form.city} onChangeText={(v) => update('city', v)} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Country" value={form.country} onChangeText={(v) => update('country', v)} />
            </View>
          </View>

          <TextField label="Billing address" value={form.billing_address} onChangeText={(v) => update('billing_address', v)} />
          <TextField label="Shipping address" value={form.shipping_address} onChangeText={(v) => update('shipping_address', v)} />
          <TextField label="Nature of business" value={form.nature_of_business} onChangeText={(v) => update('nature_of_business', v)} />

          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Credit limit"
                value={form.credit_limit}
                onChangeText={(v) => update('credit_limit', v)}
                keyboardType="decimal-pad"
                error={fieldErrors.credit_limit}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="Payment terms (days)"
                value={form.payment_terms_days}
                onChangeText={(v) => update('payment_terms_days', v)}
                keyboardType="number-pad"
                error={fieldErrors.payment_terms_days}
              />
            </View>
          </View>

          <SelectField
            label="Status"
            value={form.status}
            onChange={(v) => update('status', v as FormState['status'])}
            options={[
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ]}
            searchable={false}
          />

          <TextField
            label="Notes"
            value={form.notes}
            onChangeText={(v) => update('notes', v)}
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
          />
        </View>

        <Button onPress={handleSave} isLoading={saving} style={styles.saveBtn}>
          {isEditing ? 'Save changes' : 'Create client'}
        </Button>

        {isEditing && (
          <Button variant="danger" onPress={handleDelete} isLoading={deleting} style={styles.deleteBtn}>
            Delete client
          </Button>
        )}
      </GlassCard>
    </ScrollView>
  );
}

function customerToForm(c: Customer): FormState {
  return {
    customer_type: c.customer_type,
    name: c.name,
    code: c.code ?? '',
    contact_person: c.contact_person ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    city: c.city ?? '',
    country: c.country ?? '',
    billing_address: c.billing_address ?? '',
    shipping_address: c.shipping_address ?? '',
    nature_of_business: c.nature_of_business ?? '',
    credit_limit: String(c.credit_limit ?? 0),
    payment_terms_days: String(c.payment_terms_days ?? 30),
    status: c.status,
    notes: c.notes ?? '',
  };
}

function formToCreatePayload(f: FormState) {
  return {
    customer_type: f.customer_type,
    name: f.name.trim(),
    code: f.code.trim() || null,
    contact_person: f.contact_person.trim() || null,
    email: f.email.trim() || null,
    phone: f.phone.trim() || null,
    city: f.city.trim() || null,
    country: f.country.trim() || null,
    billing_address: f.billing_address.trim() || null,
    shipping_address: f.shipping_address.trim() || null,
    nature_of_business: f.nature_of_business.trim() || null,
    credit_limit: Number(f.credit_limit) || 0,
    payment_terms_days: Number(f.payment_terms_days) || 0,
    status: f.status,
    notes: f.notes.trim() || null,
  };
}

function formToUpdatePayload(f: FormState) {
  const { customer_type, name, ...rest } = formToCreatePayload(f);
  return rest;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  card: { padding: 22 },
  rowFields: { flexDirection: 'row', gap: 12 },
  saveBtn: { marginTop: 24, width: '100%' },
  deleteBtn: { marginTop: 12, width: '100%' },
  loadingText: { fontFamily: fonts.sans, color: whiteAlpha(0.5), textAlign: 'center', marginTop: 40 },
});
