import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import {
  Alert,
  Button,
  Field,
  FormSectionHeading,
  GlassCard,
  RadioGroupField,
  SelectField,
  Spinner,
  TextareaField,
  TextField,
} from '@/components/ui'
import { getCustomer, updateCustomer } from '@/api/customers'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  customerEditSchema,
  type CustomerEditFormValues,
  type CustomerEditSubmitValues,
} from '@/lib/validation'

function FormShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">{title}</h1>
        <GlassCard className="mt-8 p-8">{children}</GlassCard>
      </PageContainer>
    </AppLayout>
  )
}

/** Editing an existing customer. Creating a new one goes through the
 * multi-step CustomerOnboardingWizardPage instead (see /customers/new
 * in App.tsx) -- this component only handles /customers/:id/edit now. */
export function CustomerFormPage() {
  const { id } = useParams()
  if (!id) return <Navigate to="/customers/new" replace />
  return <CustomerEditForm id={Number(id)} />
}

function CustomerEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  // Locked after creation -- shown read-only, never submitted for edit.
  // See lib/validation/customer.ts customerEditSchema. code is the one
  // exception: null means this is still a prospective customer who
  // hasn't provided it yet, and can be filled in once (see
  // handleCompleteCode) -- but is locked the same way once set.
  const [locked, setLocked] = useState<{ name: string; code: string | null; idLabel: string } | null>(null)
  const [newCode, setNewCode] = useState('')
  const [savingCode, setSavingCode] = useState(false)
  // Convenience only -- not a stored field. When ticked, the shipping
  // address input is hidden and the billing address is copied over at
  // submit time, so the two don't have to be kept in sync by hand for
  // the common case where the delivery site is the registered address.
  const [shipSameAsBilling, setShipSameAsBilling] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomerEditFormValues, unknown, CustomerEditSubmitValues>({
    resolver: zodResolver(customerEditSchema),
  })

  const billingAddress = watch('billing_address')
  const paymentTermsType = watch('payment_terms_type')

  useEffect(() => {
    getCustomer(id)
      .then((customer) => {
        setLocked({
          name: customer.name,
          code: customer.code,
          idLabel: customer.customer_type === 'individual' ? 'Civil ID' : 'Registration number',
        })
        setShipSameAsBilling(
          Boolean(customer.billing_address) && customer.billing_address === customer.shipping_address,
        )
        reset({
          customer_type: customer.customer_type,
          trade_name: customer.trade_name ?? '',
          contact_person: customer.contact_person ?? '',
          email: customer.email ?? '',
          phone: customer.phone ?? '',
          alternate_phone: customer.alternate_phone ?? '',
          alternate_email: customer.alternate_email ?? '',
          billing_address: customer.billing_address ?? '',
          shipping_address: customer.shipping_address ?? '',
          city: customer.city ?? '',
          country: customer.country ?? '',
          category: customer.category ?? '',
          credit_limit: customer.credit_limit,
          payment_terms_days: customer.payment_terms_days,
          payment_terms_type: customer.payment_terms_type,
          discount_approval_threshold_override: customer.discount_approval_threshold_override ?? '',
          status: customer.status,
          notes: customer.notes ?? '',
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  // Keep shipping_address mirrored live while the checkbox is on, so the
  // value that's actually submitted is always current even though the
  // input itself is hidden (see the JSX below).
  useEffect(() => {
    if (shipSameAsBilling) setValue('shipping_address', billingAddress)
  }, [shipSameAsBilling, billingAddress, setValue])

  async function handleCompleteCode() {
    if (!newCode.trim()) return
    setSavingCode(true)
    setFormError(null)
    try {
      const updated = await updateCustomer(id, { code: newCode.trim() })
      setLocked((prev) => (prev ? { ...prev, code: updated.code } : prev))
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSavingCode(false)
    }
  }

  async function onSubmit(values: CustomerEditSubmitValues) {
    setFormError(null)
    try {
      await updateCustomer(id, {
        ...values,
        discount_approval_threshold_override: values.discount_approval_threshold_override || null,
      })
      navigate(`/customers/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit customer">
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <FormSectionHeading>Basic information</FormSectionHeading>
          <div className="grid grid-cols-1 gap-6 rounded-xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2">
            <Field label="Name" value={locked?.name} />
            {locked && locked.code === null ? (
              <div className="flex items-end gap-3">
                <TextField
                  label={locked.idLabel}
                  hint="Still prospective -- not provided yet"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                />
                <Button type="button" size="sm" isLoading={savingCode} onClick={handleCompleteCode}>
                  Save
                </Button>
              </div>
            ) : (
              <Field label={locked?.idLabel ?? 'ID'} value={locked?.code} />
            )}
          </div>
          <p className="text-xs text-white/40">
            Name{locked?.code !== null && ` and ${locked?.idLabel?.toLowerCase()}`} {locked?.code !== null ? 'are' : 'is'} set at
            creation and can't be changed here.
          </p>
          <RadioGroupField
            label="Business or individual"
            error={errors.customer_type?.message}
            options={[
              { value: 'business', label: 'Business' },
              { value: 'individual', label: 'Individual' },
            ]}
            {...register('customer_type')}
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="Display / trading name"
              hint="Shown instead of the legal name above where set. Leave blank to just use the legal name."
              error={errors.trade_name?.message}
              {...register('trade_name')}
            />
            <TextField label="Category" error={errors.category?.message} {...register('category')} />
          </div>

          <FormSectionHeading>Primary contact</FormSectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Contact person" {...register('contact_person')} />
            <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Phone" {...register('phone')} />
            <TextField label="Alternate phone" error={errors.alternate_phone?.message} {...register('alternate_phone')} />
          </div>
          <TextField
            label="Alternate email"
            type="email"
            error={errors.alternate_email?.message}
            {...register('alternate_email')}
          />

          <FormSectionHeading>Address</FormSectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="City" {...register('city')} />
            <TextField label="Country" {...register('country')} />
          </div>
          <TextareaField label="Billing / registered address" {...register('billing_address')} />
          <label className="flex items-center gap-3 text-sm text-white/70">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-transparent"
              checked={shipSameAsBilling}
              onChange={(e) => setShipSameAsBilling(e.target.checked)}
            />
            Delivery / site address same as billing address
          </label>
          {!shipSameAsBilling && (
            <TextareaField label="Delivery / site address" {...register('shipping_address')} />
          )}

          <FormSectionHeading>Commercial information</FormSectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField
              label="Credit limit"
              type="number"
              step="0.01"
              hint="0 = not enforced. Above 0, confirming a new order that would push this customer's outstanding balance over the limit needs admin approval."
              error={errors.credit_limit?.message}
              {...register('credit_limit')}
            />
            <SelectField label="Payment terms" {...register('payment_terms_type')}>
              <option value="cash">Cash</option>
              <option value="advance">Advance</option>
              <option value="credit">Credit</option>
              <option value="custom">Custom</option>
            </SelectField>
            <TextField
              label="Credit days"
              type="number"
              hint={paymentTermsType === 'credit' ? 'Required when payment terms is Credit.' : undefined}
              error={errors.payment_terms_days?.message}
              {...register('payment_terms_days')}
            />
          </div>
          <TextField
            label="Discount approval threshold override (%)"
            type="number"
            step="0.01"
            hint="Leave blank to use the factory-wide setting (Settings > Approvals). Set this to give this customer their own discount ceiling before a quotation/order needs admin sign-off."
            error={errors.discount_approval_threshold_override?.message}
            {...register('discount_approval_threshold_override')}
          />

          <FormSectionHeading>Status</FormSectionHeading>
          <SelectField label="Status" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>

          <FormSectionHeading>Internal notes</FormSectionHeading>
          <TextareaField
            label="Internal notes"
            hint="For internal staff use only -- never shown on quotations, orders, or customer-facing documents."
            {...register('notes')}
          />

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
