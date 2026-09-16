import { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { GlassCard } from '../components/GlassCard';
import { IdDocumentPanel } from '../components/IdDocumentPanel';
import { IdDocumentPickerField } from '../components/IdDocumentPickerField';
import { SelectField } from '../components/SelectField';
import { StatusBadge } from '../components/StatusBadge';
import { StatusTransitionButtons } from '../components/StatusTransitionButtons';
import { TextField } from '../components/TextField';
import { colors, fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { confirm } from '../utils/alerts';
import {
  CUSTOMER_ONBOARDING_STATUSES_REQUIRING_REASON,
  CUSTOMER_ONBOARDING_TRANSITIONS,
  Customer,
  CustomerCreditStatus,
  CustomerOnboardingStatus,
  PickedFile,
  createCustomer,
  deleteCustomer,
  deleteCustomerIdDocument,
  getCustomer,
  getCustomerCredit,
  unverifyCustomerId,
  updateCustomer,
  updateCustomerOnboardingStatus,
  uploadCustomerIdDocument,
  verifyCustomerId,
  viewCustomerIdDocument,
} from '../api/customers';
import { ClientsStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../utils/roles';

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
  credit_limit: '0',
  payment_terms_days: '30',
  status: 'active',
  notes: '',
};

type FieldKey = keyof FormState;

// Mirrors backend/app/schemas/customer.py's Field(max_length=...)
// constraints / frontend/src/lib/validation/customer.ts's zod schema.
const MAX_LENGTHS: Partial<Record<FieldKey, number>> = {
  name: 150,
  code: 30,
  contact_person: 120,
  email: 120,
  phone: 30,
  billing_address: 255,
  shipping_address: 255,
  city: 80,
  country: 80,
  notes: 5000,
};

type LocaleT = ReturnType<typeof useLocale>['t'];

function validateField(t: LocaleT, key: FieldKey, form: FormState, requireCode: boolean): string | null {
  const value = form[key];
  if (key === 'name' && !value.trim()) return t('clientForm', 'nameRequiredError');
  if (key === 'code' && requireCode && !value.trim()) return t('clientForm', 'codeRequiredError');
  if (key === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) return t('clientForm', 'emailInvalidError');
  if (key === 'credit_limit') {
    const n = Number(value);
    if (value && (Number.isNaN(n) || n < 0)) return t('clientForm', 'creditLimitError');
  }
  if (key === 'payment_terms_days') {
    const n = Number(value);
    if (value && (Number.isNaN(n) || n < 0)) return t('clientForm', 'paymentTermsError');
  }
  const max = MAX_LENGTHS[key];
  if (max && value.length > max) return t('clientForm', 'maxLengthError', { max });
  return null;
}

// The "New client" wizard's steps -- mirrors
// CustomerOnboardingWizardPage's STEPS exactly, field-for-field, so the
// same information is collected in the same grouping and order.
type StepId = 'type' | 'company' | 'contact' | 'financial' | 'review';
const WIZARD_STEPS: { id: StepId; fields: FieldKey[] }[] = [
  { id: 'type', fields: ['customer_type'] },
  { id: 'company', fields: ['code', 'name', 'contact_person'] },
  { id: 'contact', fields: ['email', 'phone', 'city', 'country', 'billing_address', 'shipping_address'] },
  { id: 'financial', fields: ['credit_limit', 'payment_terms_days', 'notes'] },
  { id: 'review', fields: [] },
];

export function ClientFormScreen({ route, navigation }: Props) {
  const { t } = useLocale();
  const { user } = useAuth();
  const allowAdmin = isAdmin(user?.role);
  const customerId = route.params?.customerId;
  const isEditing = Boolean(customerId);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Edit mode only -- everything the wizard's Review step + the detail-
  // page-equivalent panels below need that isn't part of the editable
  // form itself.
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [creditStatus, setCreditStatus] = useState<CustomerCreditStatus | null>(null);
  const [newCode, setNewCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  // New-client wizard state.
  const [stepIndex, setStepIndex] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [idDocumentAsset, setIdDocumentAsset] = useState<PickedFile | null>(null);
  const [idDocumentError, setIdDocumentError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: isEditing ? t('clientForm', 'editTitle') : t('clientForm', 'newTitle') });
    if (!customerId) return;
    (async () => {
      try {
        const c = await getCustomer(customerId);
        setCustomer(c);
        setForm(customerToForm(c));
      } catch (err: any) {
        setError(err?.message ?? t('clientForm', 'loadError'));
      } finally {
        setLoading(false);
      }
    })();
    getCustomerCredit(customerId)
      .then(setCreditStatus)
      .catch(() => setCreditStatus(null));
  }, [customerId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validateKeys(keys: FieldKey[], requireCode: boolean): boolean {
    const errs: Record<string, string> = {};
    for (const key of keys) {
      const message = validateField(t, key, form, requireCode);
      if (message) errs[key] = message;
    }
    setFieldErrors((prev) => ({ ...prev, ...errs }));
    return Object.keys(errs).length === 0;
  }

  // Wizard navigation (new client only) -- mirrors
  // CustomerOnboardingWizardPage's goNext/goBack/goToStep.
  const step = WIZARD_STEPS[stepIndex];
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1;

  function goNext() {
    if (step.fields.length > 0 && !validateKeys(step.fields, true)) return;
    const next = Math.min(stepIndex + 1, WIZARD_STEPS.length - 1);
    setStepIndex(next);
    setFurthestStep((f) => Math.max(f, next));
  }

  function goBackStep() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function goToStep(index: number) {
    if (index > furthestStep) return;
    setStepIndex(index);
  }

  async function handleCreate() {
    setError(null);
    // Per-step validation on "Next" (goNext) keeps a user from advancing
    // with bad data, but stepping back to fix one field and returning
    // straight to Review would otherwise skip re-checking every other
    // step -- validate everything one more time right before the actual
    // create, and land back on the first step that still has a problem.
    const allFields = WIZARD_STEPS.flatMap((s) => s.fields);
    if (!validateKeys(allFields, true)) {
      const firstInvalidStep = WIZARD_STEPS.findIndex((s) => s.fields.some((f) => validateField(t, f, form, true)));
      if (firstInvalidStep !== -1) setStepIndex(firstInvalidStep);
      return;
    }
    setSaving(true);
    try {
      const created = await createCustomer(formToCreatePayload(form));
      if (idDocumentAsset) {
        // Best-effort: the customer record itself is already created at
        // this point, so a failed upload here shouldn't block landing on
        // it -- the document can always be added from this same screen.
        await uploadCustomerIdDocument(created.id, idDocumentAsset).catch(() => {});
      }
      // Land on the new client's own edit screen (same as the web
      // wizard navigating to /customers/:id) so the onboarding tools
      // below are right there if there's more to do.
      navigation.replace('ClientForm', { customerId: created.id });
    } catch (err: any) {
      setError(err?.message ?? t('clientForm', 'saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!customerId) return;
    setError(null);
    // code isn't part of this form's own submit (see formToUpdatePayload
    // / handleCompleteCode), so it's excluded here too.
    const editableKeys = (Object.keys(form) as FieldKey[]).filter((k) => k !== 'code');
    if (!validateKeys(editableKeys, false)) return;
    setSaving(true);
    try {
      const updated = await updateCustomer(customerId, formToUpdatePayload(form));
      setCustomer(updated);
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message ?? t('clientForm', 'saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!customerId) return;
    const proceed = await confirm(
      t('clientForm', 'deleteConfirmTitle'),
      t('clientForm', 'deleteConfirmMessage', { name: form.name }),
      t('clientForm', 'deleteClient'),
      t('common', 'cancel'),
      { destructive: true },
    );
    if (!proceed) return;
    setDeleting(true);
    try {
      await deleteCustomer(customerId);
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message ?? t('clientForm', 'deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  // code (civil ID / registration number) is locked once set, same as
  // name -- this is the one-time "fill it in later" path for a
  // prospective customer created with no code yet (see
  // CustomerFormPage's handleCompleteCode).
  async function handleCompleteCode() {
    if (!customerId || !newCode.trim()) return;
    setSavingCode(true);
    setError(null);
    try {
      const updated = await updateCustomer(customerId, { code: newCode.trim() });
      setCustomer(updated);
    } catch (err: any) {
      setError(err?.message ?? t('clientForm', 'saveError'));
    } finally {
      setSavingCode(false);
    }
  }

  async function handleOnboardingStatusChange(status: CustomerOnboardingStatus, reason?: string) {
    if (!customerId) return;
    setOnboardingBusy(true);
    setError(null);
    try {
      const updated = await updateCustomerOnboardingStatus(customerId, status, reason);
      setCustomer(updated);
    } catch (err: any) {
      setError(err?.message ?? t('clientForm', 'saveError'));
    } finally {
      setOnboardingBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loadingText}>{t('common', 'loading')}</Text>
      </View>
    );
  }

  const isIndividual = form.customer_type === 'individual';
  const idLabel = isIndividual ? t('clientForm', 'codeLabelIndividual') : t('clientForm', 'codeLabelBusiness');

  if (!isEditing) {
    return (
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <GlassCard strong style={styles.card}>
          <StepTabs steps={WIZARD_STEPS.map((s) => t('clientForm', `step${capitalize(s.id)}` as any))} activeIndex={stepIndex} furthestStep={furthestStep} onSelect={goToStep} />

          <Alert variant="error">{error}</Alert>

          {step.id === 'type' && (
            <SelectField
              label={t('clientForm', 'typeStepLabel')}
              value={form.customer_type}
              onChange={(v) => update('customer_type', v as FormState['customer_type'])}
              options={[
                { label: t('clientForm', 'typeBusiness'), value: 'business' },
                { label: t('clientForm', 'typeIndividual'), value: 'individual' },
              ]}
              searchable={false}
            />
          )}

          {step.id === 'company' && (
            <View style={{ gap: 18 }}>
              <TextField label={idLabel} value={form.code} onChangeText={(v) => update('code', v)} error={fieldErrors.code} />
              <TextField label={t('clientForm', 'nameLabel')} value={form.name} onChangeText={(v) => update('name', v)} error={fieldErrors.name} />
              <TextField
                label={t('clientForm', 'contactPersonLabel')}
                value={form.contact_person}
                onChangeText={(v) => update('contact_person', v)}
                error={fieldErrors.contact_person}
              />
              <IdDocumentPickerField
                label={t('clientForm', 'idDocumentStepLabel')}
                hint={t('clientForm', 'idDocumentStepHint')}
                value={idDocumentAsset}
                onChange={setIdDocumentAsset}
                error={idDocumentError}
                onError={setIdDocumentError}
              />
            </View>
          )}

          {step.id === 'contact' && (
            <View style={{ gap: 18 }}>
              <TextField
                label={t('clientForm', 'emailLabel')}
                value={form.email}
                onChangeText={(v) => update('email', v)}
                keyboardType="email-address"
                autoCapitalize="none"
                error={fieldErrors.email}
              />
              <TextField label={t('clientForm', 'phoneLabel')} value={form.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" error={fieldErrors.phone} />
              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <TextField label={t('clientForm', 'cityLabel')} value={form.city} onChangeText={(v) => update('city', v)} error={fieldErrors.city} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label={t('clientForm', 'countryLabel')} value={form.country} onChangeText={(v) => update('country', v)} error={fieldErrors.country} />
                </View>
              </View>
              <TextField
                label={t('clientForm', 'billingAddressLabel')}
                value={form.billing_address}
                onChangeText={(v) => update('billing_address', v)}
                error={fieldErrors.billing_address}
              />
              <TextField
                label={t('clientForm', 'shippingAddressLabel')}
                value={form.shipping_address}
                onChangeText={(v) => update('shipping_address', v)}
                error={fieldErrors.shipping_address}
              />
            </View>
          )}

          {step.id === 'financial' && (
            <View style={{ gap: 18 }}>
              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={t('clientForm', 'creditLimitLabel')}
                    value={form.credit_limit}
                    onChangeText={(v) => update('credit_limit', v)}
                    keyboardType="decimal-pad"
                    error={fieldErrors.credit_limit}
                    hint={t('clientForm', 'creditLimitHint')}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={t('clientForm', 'paymentTermsLabel')}
                    value={form.payment_terms_days}
                    onChangeText={(v) => update('payment_terms_days', v)}
                    keyboardType="number-pad"
                    error={fieldErrors.payment_terms_days}
                  />
                </View>
              </View>
              <TextField
                label={t('clientForm', 'notesLabel')}
                value={form.notes}
                onChangeText={(v) => update('notes', v)}
                multiline
                numberOfLines={3}
                style={{ height: 80, textAlignVertical: 'top' }}
                error={fieldErrors.notes}
              />
            </View>
          )}

          {step.id === 'review' && (
            <View style={{ gap: 18 }}>
              <Text style={styles.reviewIntro}>{t('clientForm', 'reviewIntro')}</Text>
              <SelectField
                label={t('clientForm', 'statusLabel')}
                value={form.status}
                onChange={(v) => update('status', v as FormState['status'])}
                options={[
                  { label: t('clientForm', 'statusActive'), value: 'active' },
                  { label: t('clientForm', 'statusInactive'), value: 'inactive' },
                ]}
                searchable={false}
              />
              <View style={styles.reviewBox}>
                <ReviewRow label={t('clientForm', 'typeLabel')} value={isIndividual ? t('clientForm', 'typeIndividual') : t('clientForm', 'typeBusiness')} />
                <ReviewRow label={idLabel} value={form.code} />
                <ReviewRow label={t('clientForm', 'nameLabel')} value={form.name} />
                <ReviewRow label={t('clientForm', 'contactPersonLabel')} value={form.contact_person} />
                <ReviewRow label={t('clientForm', 'emailLabel')} value={form.email} />
                <ReviewRow label={t('clientForm', 'phoneLabel')} value={form.phone} />
                <ReviewRow label={t('clientForm', 'cityLabel')} value={form.city} />
                <ReviewRow label={t('clientForm', 'countryLabel')} value={form.country} />
                <ReviewRow label={t('clientForm', 'billingAddressLabel')} value={form.billing_address} />
                <ReviewRow label={t('clientForm', 'shippingAddressLabel')} value={form.shipping_address} />
                <ReviewRow label={t('clientForm', 'creditLimitLabel')} value={form.credit_limit} />
                <ReviewRow label={t('clientForm', 'paymentTermsLabel')} value={form.payment_terms_days} />
                <ReviewRow label={t('clientForm', 'notesLabel')} value={form.notes} />
              </View>
            </View>
          )}

          <View style={styles.wizardNav}>
            <Button variant="ghost" onPress={() => (stepIndex === 0 ? navigation.goBack() : goBackStep())} style={{ flex: 1 }}>
              {stepIndex === 0 ? t('clientForm', 'stepCancel') : t('clientForm', 'stepBack')}
            </Button>
            {isLastStep ? (
              <Button isLoading={saving} onPress={handleCreate} style={{ flex: 1 }}>
                {t('clientForm', 'createClient')}
              </Button>
            ) : (
              <Button onPress={goNext} style={{ flex: 1 }}>
                {t('clientForm', 'stepNext')}
              </Button>
            )}
          </View>
        </GlassCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <GlassCard strong style={styles.card}>
        <Alert variant="error">{error}</Alert>

        <View style={{ gap: 18 }}>
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <TextField label={t('clientForm', 'nameLabel')} value={form.name} editable={false} hint={t('clientForm', 'nameLockedHint')} />
            </View>
            <View style={{ flex: 1 }}>
              {customer && customer.code === null ? (
                <View style={{ gap: 8 }}>
                  <TextField label={idLabel} value={newCode} onChangeText={setNewCode} hint={t('clientForm', 'codeStillProspectiveHint')} />
                  <Button size="sm" isLoading={savingCode} onPress={handleCompleteCode}>
                    {t('common', 'save')}
                  </Button>
                </View>
              ) : (
                <TextField label={idLabel} value={form.code} editable={false} hint={t('clientForm', 'codeLockedHint')} />
              )}
            </View>
          </View>

          <SelectField
            label={t('clientForm', 'typeLabel')}
            value={form.customer_type}
            onChange={(v) => update('customer_type', v as FormState['customer_type'])}
            options={[
              { label: t('clientForm', 'typeBusiness'), value: 'business' },
              { label: t('clientForm', 'typeIndividual'), value: 'individual' },
            ]}
            searchable={false}
          />

          <TextField label={t('clientForm', 'contactPersonLabel')} value={form.contact_person} onChangeText={(v) => update('contact_person', v)} error={fieldErrors.contact_person} />

          <TextField
            label={t('clientForm', 'emailLabel')}
            value={form.email}
            onChangeText={(v) => update('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            error={fieldErrors.email}
          />

          <TextField label={t('clientForm', 'phoneLabel')} value={form.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" error={fieldErrors.phone} />

          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <TextField label={t('clientForm', 'cityLabel')} value={form.city} onChangeText={(v) => update('city', v)} error={fieldErrors.city} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label={t('clientForm', 'countryLabel')} value={form.country} onChangeText={(v) => update('country', v)} error={fieldErrors.country} />
            </View>
          </View>

          <TextField label={t('clientForm', 'billingAddressLabel')} value={form.billing_address} onChangeText={(v) => update('billing_address', v)} error={fieldErrors.billing_address} />
          <TextField label={t('clientForm', 'shippingAddressLabel')} value={form.shipping_address} onChangeText={(v) => update('shipping_address', v)} error={fieldErrors.shipping_address} />

          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('clientForm', 'creditLimitLabel')}
                value={form.credit_limit}
                onChangeText={(v) => update('credit_limit', v)}
                keyboardType="decimal-pad"
                error={fieldErrors.credit_limit}
                hint={t('clientForm', 'creditLimitHint')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('clientForm', 'paymentTermsLabel')}
                value={form.payment_terms_days}
                onChangeText={(v) => update('payment_terms_days', v)}
                keyboardType="number-pad"
                error={fieldErrors.payment_terms_days}
              />
            </View>
          </View>

          <SelectField
            label={t('clientForm', 'statusLabel')}
            value={form.status}
            onChange={(v) => update('status', v as FormState['status'])}
            options={[
              { label: t('clientForm', 'statusActive'), value: 'active' },
              { label: t('clientForm', 'statusInactive'), value: 'inactive' },
            ]}
            searchable={false}
          />

          <TextField
            label={t('clientForm', 'notesLabel')}
            value={form.notes}
            onChangeText={(v) => update('notes', v)}
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
            error={fieldErrors.notes}
          />
        </View>

        {allowAdmin && (
          <>
            <Button onPress={handleSaveEdit} isLoading={saving} style={styles.saveBtn}>
              {t('clientForm', 'saveChanges')}
            </Button>
            <Button variant="danger" onPress={handleDelete} isLoading={deleting} style={styles.deleteBtn}>
              {t('clientForm', 'deleteClient')}
            </Button>
          </>
        )}
      </GlassCard>

      {customer && creditStatus && (
        <GlassCard strong style={[styles.card, { marginTop: 16 }]}>
          <View style={styles.creditHeader}>
            <Text style={styles.sectionTitle}>{t('clientForm', 'creditStatusTitle')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StatusBadge status={customer.status} label={customer.status === 'active' ? t('clientForm', 'statusActive') : t('clientForm', 'statusInactive')} />
              <StatusBadge status={customer.onboarding_status} label={onboardingStatusLabel(t, customer.onboarding_status)} />
            </View>
          </View>
          {creditStatus.limit_enforced ? (
            <View style={{ gap: 10 }}>
              {!creditStatus.id_verified && <Text style={styles.warningText}>{t('clientForm', 'creditUnverifiedWarning')}</Text>}
              <View style={styles.reviewBox}>
                <ReviewRow label={t('clientForm', 'outstandingBalanceLabel')} value={creditStatus.outstanding_balance.toFixed(2)} />
                <ReviewRow
                  label={t('clientForm', 'availableCreditLabel')}
                  value={creditStatus.available_credit !== null ? creditStatus.available_credit.toFixed(2) : '—'}
                />
              </View>
            </View>
          ) : (
            <Text style={styles.mutedText}>{t('clientForm', 'creditNotEnforced')}</Text>
          )}
        </GlassCard>
      )}

      {customer && (
        <View style={{ marginTop: 16 }}>
          <IdDocumentPanel
            hasDocument={Boolean(customer.id_document_filename)}
            verified={customer.id_verified}
            verifiedAt={customer.id_verified_at}
            onUpload={async (asset) => setCustomer(await uploadCustomerIdDocument(customer.id, asset))}
            onRemove={async () => setCustomer(await deleteCustomerIdDocument(customer.id))}
            onView={() => viewCustomerIdDocument(customer.id, customer.id_document_filename ?? 'id-document')}
            onVerify={async () => setCustomer(await verifyCustomerId(customer.id))}
            onUnverify={async () => setCustomer(await unverifyCustomerId(customer.id))}
          />
        </View>
      )}

      {customer &&
        (() => {
          const nextStatuses = CUSTOMER_ONBOARDING_TRANSITIONS[customer.onboarding_status];
          if (!customer.onboarding_reason && nextStatuses.length === 0) return null;
          return (
            <GlassCard strong style={[styles.card, { marginTop: 16 }]}>
              <Text style={styles.sectionTitle}>{t('onboarding', 'title')}</Text>
              {customer.onboarding_reason && (
                <Text style={styles.mutedText}>{t('onboarding', 'reasonOnFile', { reason: customer.onboarding_reason })}</Text>
              )}
              {nextStatuses.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <StatusTransitionButtons
                    nextStatuses={nextStatuses}
                    reasonRequiredFor={CUSTOMER_ONBOARDING_STATUSES_REQUIRING_REASON}
                    reasonLabel={t('onboarding', 'reasonLabel')}
                    reasonRequiredError={t('onboarding', 'reasonRequiredError')}
                    cancelLabel={t('onboarding', 'cancel')}
                    confirmLabel={t('onboarding', 'confirm')}
                    statusLabel={(s) => onboardingStatusLabel(t, s)}
                    busy={onboardingBusy}
                    onChange={handleOnboardingStatusChange}
                  />
                </View>
              )}
            </GlassCard>
          );
        })()}
    </ScrollView>
  );
}

function onboardingStatusLabel(t: LocaleT, status: CustomerOnboardingStatus): string {
  return t('onboarding', `status${capitalize(status.replace(/_./g, (m) => m[1].toUpperCase()))}` as any);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StepTabs({
  steps,
  activeIndex,
  furthestStep,
  onSelect,
}: {
  steps: string[];
  activeIndex: number;
  furthestStep: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
      {steps.map((label, index) => {
        const active = index === activeIndex;
        const reachable = index <= furthestStep;
        return (
          <Text
            key={label}
            onPress={reachable ? () => onSelect(index) : undefined}
            accessibilityRole={reachable ? 'button' : undefined}
            accessibilityLabel={label}
            accessibilityState={{ selected: active, disabled: !reachable }}
            style={[styles.tab, active && styles.tabActive, !reachable && styles.tabDisabled]}
          >
            {label}
          </Text>
        );
      })}
    </ScrollView>
  );
}

function ReviewRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value || '—'}</Text>
    </View>
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
    credit_limit: Number(f.credit_limit) || 0,
    payment_terms_days: Number(f.payment_terms_days) || 0,
    status: f.status,
    notes: f.notes.trim() || null,
  };
}

function formToUpdatePayload(f: FormState) {
  // code is deliberately not sendable here -- CustomerUpdate on the
  // backend rejects trying to change it once already set; see
  // handleCompleteCode for the one-time null -> value path instead.
  const { customer_type, name, code, ...rest } = formToCreatePayload(f);
  return { customer_type, ...rest };
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.ink950, padding: 18 },
  card: { padding: 22 },
  rowFields: { flexDirection: 'row', gap: 12 },
  saveBtn: { marginTop: 24, width: '100%' },
  deleteBtn: { marginTop: 12, width: '100%' },
  loadingText: { fontFamily: fonts.sans, color: whiteAlpha(0.5), textAlign: 'center', marginTop: 40 },

  tabsScroll: { marginBottom: 20, flexGrow: 0 },
  tabsRow: { gap: 8 },
  tab: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: whiteAlpha(0.35),
    borderWidth: 1,
    borderColor: whiteAlpha(0.1),
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  tabActive: { color: colors.ink950, backgroundColor: colors.gold300, borderColor: colors.gold300 },
  tabDisabled: { opacity: 0.4 },

  wizardNav: { flexDirection: 'row', gap: 12, marginTop: 24 },

  reviewIntro: { fontFamily: fonts.sans, fontSize: 13, color: whiteAlpha(0.5), lineHeight: 19 },
  reviewBox: { backgroundColor: whiteAlpha(0.04), borderRadius: 12, padding: 14, gap: 4 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  reviewLabel: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.4), flexShrink: 0 },
  reviewValue: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.white, flexShrink: 1, textAlign: 'right' },

  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.white, marginBottom: 8 },
  creditHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  warningText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: '#fcd34d',
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 10,
    padding: 10,
  },
  mutedText: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.4) },
});
