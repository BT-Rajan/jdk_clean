import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import {
  Alert,
  Button,
  GlassCard,
  RadioGroupField,
  SelectField,
  Tabs,
  TextareaField,
  TextField,
} from '@/components/ui'
import { IdDocumentPicker } from '@/components/documents/IdDocumentPicker'
import { createCustomer, uploadCustomerIdDocument } from '@/api/customers'
import { getApiErrorMessage } from '@/lib/apiError'
import { customerSchema, type CustomerFormValues, type CustomerSubmitValues } from '@/lib/validation'
import { formatCurrency } from '@/lib/currency'

type StepId = 'type' | 'company' | 'contact' | 'financial' | 'review'

const STEPS: { id: StepId; label: string; fields: (keyof CustomerFormValues)[] }[] = [
  { id: 'type', label: 'Type', fields: ['customer_type'] },
  { id: 'company', label: 'Company Details', fields: ['code', 'name', 'trade_name', 'category', 'contact_person'] },
  {
    id: 'contact',
    label: 'Contact & Address',
    fields: ['email', 'phone', 'alternate_email', 'alternate_phone', 'city', 'country', 'billing_address', 'shipping_address'],
  },
  { id: 'financial', label: 'Financial Terms', fields: ['credit_limit', 'payment_terms_type', 'payment_terms_days', 'notes'] },
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
  // Uploaded separately after creation (it's a multipart request, the
  // rest of this form is JSON) -- see onSubmit below.
  const [idDocumentFile, setIdDocumentFile] = useState<File | null>(null)
  const [idDocumentError, setIdDocumentError] = useState<string | null>(null)
  // Convenience only -- see CustomerFormPage's identical checkbox for
  // why this mirrors billing_address into shipping_address rather than
  // being its own stored field.
  const [shipSameAsBilling, setShipSameAsBilling] = useState(true)
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues, unknown, CustomerSubmitValues>({
    resolver: zodResolver(customerSchema),
    mode: 'onBlur',
    defaultValues: {
      customer_type: 'business',
      code: '',
      name: '',
      trade_name: '',
      category: '',
      contact_person: '',
      email: '',
      phone: '',
      alternate_phone: '',
      alternate_email: '',
      billing_address: '',
      shipping_address: '',
      city: '',
      country: '',
      credit_limit: 0,
      payment_terms_days: 30,
      payment_terms_type: 'credit',
      status: 'active',
      notes: '',
    },
  })

  const step = STEPS[stepIndex]
  const isLastStep = stepIndex === STEPS.length - 1
  const values = getValues()
  const customerType = watch('customer_type')
  const isIndividual = customerType === 'individual'
  const idLabel = isIndividual ? 'Civil ID' : 'Registration number'
  const billingAddress = watch('billing_address')
  const paymentTermsType = watch('payment_terms_type')

  useEffect(() => {
    if (shipSameAsBilling) setValue('shipping_address', billingAddress)
  }, [shipSameAsBilling, billingAddress, setValue])

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
      const created = await createCustomer({
        ...values,
        // Not collected in the wizard -- new customers start on the
        // factory-wide default; an override is a deliberate later
        // decision set via CustomerFormPage once the customer's actually
        // been dealt with for a while.
        discount_approval_threshold_override: values.discount_approval_threshold_override || null,
      })
      if (idDocumentFile) {
        // Best-effort: the customer record itself is already created at
        // this point, so a failed upload here shouldn't block navigating
        // to it -- the document can always be added from the detail page.
        await uploadCustomerIdDocument(created.id, idDocumentFile).catch(() => {})
      }
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
            {step.id === 'type' && (
              <RadioGroupField
                label="Business or individual"
                error={errors.customer_type?.message}
                options={[
                  { value: 'business', label: 'Business' },
                  { value: 'individual', label: 'Individual' },
                ]}
                {...register('customer_type')}
              />
            )}

            {step.id === 'company' && (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField label={idLabel} error={errors.code?.message} {...register('code')} />
                  <TextField label="Name" error={errors.name?.message} {...register('name')} />
                  <TextField
                    label="Display / trading name"
                    hint="Shown instead of the legal name above where set. Leave blank to just use the legal name."
                    error={errors.trade_name?.message}
                    {...register('trade_name')}
                  />
                  <TextField label="Category" error={errors.category?.message} {...register('category')} />
                  <TextField label="Contact person" {...register('contact_person')} />
                </div>
                <IdDocumentPicker
                  label={`${idLabel} document`}
                  hint="A photo or scan of the document, or a PDF. Can be added later from the customer's page instead. A credit limit can only be enforced once this is uploaded and verified by admin."
                  value={idDocumentFile}
                  onChange={setIdDocumentFile}
                  error={idDocumentError}
                  onError={setIdDocumentError}
                />
              </>
            )}

            {step.id === 'contact' && (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
                  <TextField label="Phone" {...register('phone')} />
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField
                    label="Alternate email"
                    type="email"
                    error={errors.alternate_email?.message}
                    {...register('alternate_email')}
                  />
                  <TextField label="Alternate phone" error={errors.alternate_phone?.message} {...register('alternate_phone')} />
                </div>
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
              </>
            )}

            {step.id === 'financial' && (
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
                  <SelectField label="Payment terms" {...register('payment_terms_type')}>
                    <option value="cash">Cash</option>
                    <option value="advance">Advance</option>
                    <option value="credit">Credit</option>
                    <option value="custom">Custom</option>
                  </SelectField>
                </div>
                <TextField
                  label="Credit days"
                  type="number"
                  hint={paymentTermsType === 'credit' ? 'Required when payment terms is Credit.' : undefined}
                  error={errors.payment_terms_days?.message}
                  {...register('payment_terms_days')}
                />
                <TextareaField label="Internal notes" hint="For internal staff use only." {...register('notes')} />
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
                  <ReviewField label="Type" value={isIndividual ? 'Individual' : 'Business'} />
                  <ReviewField label={idLabel} value={values.code} />
                  <ReviewField label="Name" value={values.name} />
                  <ReviewField label="Display / trading name" value={values.trade_name} />
                  <ReviewField label="Category" value={values.category} />
                  <ReviewField label="Contact person" value={values.contact_person} />
                  <ReviewField label="Email" value={values.email} />
                  <ReviewField label="Phone" value={values.phone} />
                  <ReviewField label="Alternate email" value={values.alternate_email} />
                  <ReviewField label="Alternate phone" value={values.alternate_phone} />
                  <ReviewField label="City" value={values.city} />
                  <ReviewField label="Country" value={values.country} />
                  <ReviewField label="Billing address" value={values.billing_address} />
                  <ReviewField label="Delivery / site address" value={values.shipping_address} />
                  <ReviewField label="Credit limit" value={formatCurrency(Number(values.credit_limit || 0))} />
                  <ReviewField label="Payment terms" value={`${values.payment_terms_type} (${values.payment_terms_days || 0} days)`} />
                  <ReviewField label="Notes" value={values.notes} />
                </dl>
              </div>
            )}

            <div className="mt-2 flex justify-between gap-3">
              <Button variant="ghost" type="button" onClick={() => (stepIndex === 0 ? navigate(-1) : goBack())}>
                {stepIndex === 0 ? 'Cancel' : 'Back'}
              </Button>
              {isLastStep ? (
                // type="button" with an explicit handleSubmit(onSubmit) call, not
                // type="submit" -- a real mouse click has a non-zero gap between
                // mousedown and mouseup, and goNext's await trigger(...) above
                // resolves fast enough to land inside that gap on the click that
                // lands here: React re-renders this exact button from "Next" to
                // "Create customer" *between* the down and up of the same click.
                // If this button's type flips to "submit" during that gap, the
                // browser's native default action submits the form right then --
                // skipping Review and posting whatever was last valid, without
                // the user ever seeing or confirming this button. Keeping it
                // type="button" always and submitting programmatically removes
                // that native submit-on-click pathway entirely.
                <Button type="button" isLoading={isSubmitting} onClick={handleSubmit(onSubmit)}>
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
