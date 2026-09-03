import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Tabs, TextareaField, TextField } from '@/components/ui'
import { createCustomer } from '@/api/customers'
import { getApiErrorMessage } from '@/lib/apiError'
import { customerSchema, type CustomerFormValues, type CustomerSubmitValues } from '@/lib/validation'
import { formatCurrency } from '@/lib/currency'

type StepId = 'company' | 'contact' | 'financial' | 'review'

const STEPS: { id: StepId; label: string; fields: (keyof CustomerFormValues)[] }[] = [
  { id: 'company', label: 'Company Details', fields: ['code', 'name', 'contact_person'] },
  {
    id: 'contact',
    label: 'Contact & Address',
    fields: ['email', 'phone', 'city', 'country', 'billing_address', 'shipping_address'],
  },
  { id: 'financial', label: 'Financial Terms', fields: ['credit_limit', 'payment_terms_days', 'notes'] },
  { id: 'review', label: 'Review', fields: [] },
]

/** Multi-step "New customer" onboarding wizard: the same fields
 * CustomerFormPage's create form collects in one long page, split into
 * steps with per-step validation so problems are caught (and shown)
 * before the person reaches Review, rather than only on final submit.
 * The customer record starts in onboarding_status 'pending' on the
 * backend -- see CustomerDetailPage for the status workflow from there. */
export function CustomerOnboardingWizardPage() {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [furthestStep, setFurthestStep] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues, unknown, CustomerSubmitValues>({
    resolver: zodResolver(customerSchema),
    mode: 'onBlur',
    defaultValues: {
      code: '',
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      billing_address: '',
      shipping_address: '',
      city: '',
      country: '',
      credit_limit: 0,
      payment_terms_days: 30,
      status: 'active',
      notes: '',
    },
  })

  const step = STEPS[stepIndex]
  const isLastStep = stepIndex === STEPS.length - 1
  const values = getValues()

  async function goNext() {
    const valid = step.fields.length === 0 || (await trigger(step.fields))
    if (!valid) return
    const next = Math.min(stepIndex + 1, STEPS.length - 1)
    setStepIndex(next)
    setFurthestStep((f) => Math.max(f, next))
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  function goToStep(id: string) {
    const index = STEPS.findIndex((s) => s.id === id)
    if (index === -1 || index > furthestStep) return
    setStepIndex(index)
  }

  async function onSubmit(values: CustomerSubmitValues) {
    setFormError(null)
    try {
      const created = await createCustomer(values)
      navigate(`/customers/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">New customer</h1>
        <p className="mt-1 text-sm text-white/50">Onboard a new customer in a few steps.</p>

        <GlassCard className="mt-8 p-8">
          <Tabs
            items={STEPS.map((s) => ({ id: s.id, label: s.label }))}
            activeId={step.id}
            onChange={goToStep}
            className="mb-8"
          />

          <Alert variant="error">{formError}</Alert>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
            {stepIndex === 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <TextField label="Code" error={errors.code?.message} {...register('code')} />
                <TextField label="Name" error={errors.name?.message} {...register('name')} />
                <TextField label="Contact person" {...register('contact_person')} />
              </div>
            )}

            {stepIndex === 1 && (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
                  <TextField label="Phone" {...register('phone')} />
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField label="City" {...register('city')} />
                  <TextField label="Country" {...register('country')} />
                </div>
                <TextareaField label="Billing address" {...register('billing_address')} />
                <TextareaField label="Shipping address" {...register('shipping_address')} />
              </>
            )}

            {stepIndex === 2 && (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField
                    label="Credit limit"
                    type="number"
                    step="0.01"
                    hint="0 = not enforced. Above 0, confirming a new order that would push this customer's outstanding balance over the limit needs admin approval."
                    error={errors.credit_limit?.message}
                    {...register('credit_limit')}
                  />
                  <TextField
                    label="Payment terms (days)"
                    type="number"
                    error={errors.payment_terms_days?.message}
                    {...register('payment_terms_days')}
                  />
                </div>
                <TextareaField label="Notes" {...register('notes')} />
                <input type="hidden" {...register('status')} />
              </>
            )}

            {isLastStep && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-white/50">
                  Review the details below, then create the customer. It starts in onboarding status
                  &ldquo;Pending&rdquo; -- move it through review from its detail page once it&rsquo;s created.
                </p>
                <SelectField label="Status" {...register('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </SelectField>
                <dl className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2">
                  <ReviewField label="Code" value={values.code} />
                  <ReviewField label="Name" value={values.name} />
                  <ReviewField label="Contact person" value={values.contact_person} />
                  <ReviewField label="Email" value={values.email} />
                  <ReviewField label="Phone" value={values.phone} />
                  <ReviewField label="City" value={values.city} />
                  <ReviewField label="Country" value={values.country} />
                  <ReviewField label="Billing address" value={values.billing_address} />
                  <ReviewField label="Shipping address" value={values.shipping_address} />
                  <ReviewField label="Credit limit" value={formatCurrency(Number(values.credit_limit || 0))} />
                  <ReviewField label="Payment terms" value={`${values.payment_terms_days || 0} days`} />
                  <ReviewField label="Notes" value={values.notes} />
                </dl>
              </div>
            )}

            <div className="mt-2 flex justify-between gap-3">
              <Button variant="ghost" type="button" onClick={() => (stepIndex === 0 ? navigate(-1) : goBack())}>
                {stepIndex === 0 ? 'Cancel' : 'Back'}
              </Button>
              {isLastStep ? (
                <Button type="submit" isLoading={isSubmitting}>
                  Create customer
                </Button>
              ) : (
                <Button type="button" onClick={goNext}>
                  Next
                </Button>
              )}
            </div>
          </form>
        </GlassCard>
      </PageContainer>
    </AppLayout>
  )
}

function ReviewField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="mt-0.5 text-sm text-white">{value || '—'}</dd>
    </div>
  )
}
