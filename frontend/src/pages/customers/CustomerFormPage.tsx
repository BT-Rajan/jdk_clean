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
  // See lib/validation/customer.ts customerEditSchema.
  const [locked, setLocked] = useState<{ name: string; code: string; idLabel: string } | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomerEditFormValues, unknown, CustomerEditSubmitValues>({
    resolver: zodResolver(customerEditSchema),
  })

  useEffect(() => {
    getCustomer(id)
      .then((customer) => {
        setLocked({
          name: customer.name,
          code: customer.code,
          idLabel: customer.customer_type === 'individual' ? 'Civil ID' : 'Registration number',
        })
        reset({
          customer_type: customer.customer_type,
          nature_of_business: customer.nature_of_business ?? '',
          contact_person: customer.contact_person ?? '',
          email: customer.email ?? '',
          phone: customer.phone ?? '',
          billing_address: customer.billing_address ?? '',
          shipping_address: customer.shipping_address ?? '',
          city: customer.city ?? '',
          country: customer.country ?? '',
          credit_limit: customer.credit_limit,
          payment_terms_days: customer.payment_terms_days,
          status: customer.status,
          notes: customer.notes ?? '',
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  const isIndividual = watch('customer_type') === 'individual'

  async function onSubmit(values: CustomerEditSubmitValues) {
    setFormError(null)
    try {
      await updateCustomer(id, values)
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
          <div className="grid grid-cols-1 gap-6 rounded-xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2">
            <Field label="Name" value={locked?.name} />
            <Field label={locked?.idLabel ?? 'ID'} value={locked?.code} />
          </div>
          <p className="text-xs text-white/40">Name and {locked?.idLabel?.toLowerCase()} are set at creation and can't be changed here.</p>

          <RadioGroupField
            label="Business or individual"
            error={errors.customer_type?.message}
            options={[
              { value: 'business', label: 'Business' },
              { value: 'individual', label: 'Individual' },
            ]}
            {...register('customer_type')}
          />
          {!isIndividual && <TextField label="Nature of business" {...register('nature_of_business')} />}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Contact person" {...register('contact_person')} />
            <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField label="Phone" {...register('phone')} />
            <TextField label="City" {...register('city')} />
          </div>
          <TextField label="Country" {...register('country')} />
          <TextareaField label="Billing address" {...register('billing_address')} />
          <TextareaField label="Shipping address" {...register('shipping_address')} />
          <TextareaField label="Notes" {...register('notes')} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <TextField
            label="Credit limit"
            type="number"
            step="0.01"
            hint="0 = not enforced. Above 0, confirming a new order that would push this customer's outstanding balance over the limit needs admin approval."
            error={errors.credit_limit?.message}
            {...register('credit_limit')}
          />
            <TextField label="Payment terms (days)" type="number" error={errors.payment_terms_days?.message} {...register('payment_terms_days')} />
            <SelectField label="Status" {...register('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectField>
          </div>
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
