import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Tabs, TextField } from '@/components/ui'
import { IdDocumentPicker } from '@/components/documents/IdDocumentPicker'
import { createSupplier, uploadSupplierIdDocument } from '@/api/suppliers'
import { replaceSupplierMaterials } from '@/api/supplierMaterials'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { generateId } from '@/lib/id'
import { supplierSchema, type SupplierFormValues, type SupplierSubmitValues } from '@/lib/validation'
import type { SupplierMaterialInput } from '@/types/supplierMaterial'

type StepId = 'company' | 'contact' | 'materials' | 'terms' | 'review'

interface EditableMaterialLine {
  key: string
  raw_material_id: number
  max_supply_quantity: number
}

function emptyMaterialLine(): EditableMaterialLine {
  return { key: generateId(), raw_material_id: 0, max_supply_quantity: 1 }
}

const MODE_OF_SUPPLY_LABELS: Record<string, string> = {
  direct: 'Direct',
  distributor: 'Distributor',
  broker: 'Broker',
  import: 'Import',
}

const STEPS: { id: StepId; label: string; fields: (keyof SupplierFormValues)[] }[] = [
  { id: 'company', label: 'Company Details', fields: ['name', 'contact_person'] },
  { id: 'contact', label: 'Contact & Address', fields: ['email', 'phone', 'city', 'country', 'address'] },
  { id: 'materials', label: 'Materials Supplied', fields: [] },
  { id: 'terms', label: 'Terms & Supply', fields: ['payment_terms_days', 'mode_of_supply', 'rating'] },
  { id: 'review', label: 'Review', fields: [] },
]

/** Multi-step "New supplier" onboarding wizard -- same shape as
 * customers' CustomerOnboardingWizardPage, applied to Supplier's own
 * fields. The supplier record starts in onboarding_status 'pending' on
 * the backend -- see SupplierDetailPage for the status workflow from
 * there. */
export function SupplierOnboardingWizardPage() {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [furthestStep, setFurthestStep] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)
  // Both uploaded/saved separately after creation -- see onSubmit below.
  const [idDocumentFile, setIdDocumentFile] = useState<File | null>(null)
  const [idDocumentError, setIdDocumentError] = useState<string | null>(null)
  const [materialLines, setMaterialLines] = useState<EditableMaterialLine[]>([])
  const [materialsError, setMaterialsError] = useState<string | null>(null)

  const rawMaterialsFetcher = useCallback(() => listRawMaterials({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: rawMaterials } = useSelectOptions(rawMaterialsFetcher)

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues, unknown, SupplierSubmitValues>({
    resolver: zodResolver(supplierSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: '',
      payment_terms_days: 30,
      mode_of_supply: '',
      rating: '',
      status: 'active',
    },
  })

  const step = STEPS[stepIndex]
  const isLastStep = stepIndex === STEPS.length - 1
  const values = getValues()
  const validMaterialLines = materialLines.filter((l) => l.raw_material_id > 0 && l.max_supply_quantity > 0)

  function updateMaterialLine(key: string, patch: Partial<EditableMaterialLine>) {
    setMaterialLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeMaterialLine(key: string) {
    setMaterialLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function goNext() {
    const valid = step.fields.length === 0 || (await trigger(step.fields))
    if (!valid) return
    if (step.id === 'materials') {
      if (validMaterialLines.length === 0) {
        setMaterialsError('Add at least one raw material this supplier can provide before continuing.')
        return
      }
      setMaterialsError(null)
    }
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

  async function onSubmit(values: SupplierSubmitValues) {
    setFormError(null)
    // Safety net in case Review was reached some way other than clicking
    // through the materials step's own "Next" (goNext already blocks
    // that path) -- a supplier record needs to say what it can actually
    // supply before it's created.
    if (validMaterialLines.length === 0) {
      setFormError('Add at least one raw material this supplier can provide before creating the supplier.')
      setStepIndex(STEPS.findIndex((s) => s.id === 'materials'))
      return
    }
    try {
      const created = await createSupplier({
        ...values,
        mode_of_supply: values.mode_of_supply || null,
        rating: values.rating || null,
      })
      if (idDocumentFile) {
        // Best-effort, same reasoning as the id document upload in
        // CustomerOnboardingWizardPage -- the supplier record already
        // exists at this point, so neither this nor the materials save
        // below should block navigating to it.
        await uploadSupplierIdDocument(created.id, idDocumentFile).catch(() => {})
      }
      const validLines: SupplierMaterialInput[] = validMaterialLines.map(
        ({ raw_material_id, max_supply_quantity }) => ({ raw_material_id, max_supply_quantity, lead_time_days: null }),
      )
      await replaceSupplierMaterials(created.id, validLines).catch(() => {})
      navigate(`/suppliers/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">New supplier</h1>
        <p className="mt-1 text-sm text-white/50">Onboard a new supplier in a few steps.</p>

        <GlassCard className="mt-8 p-8">
          <Tabs
            items={STEPS.map((s) => ({ id: s.id, label: s.label }))}
            activeId={step.id}
            onChange={goToStep}
            className="mb-8"
          />

          <Alert variant="error">{formError}</Alert>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
            {step.id === 'company' && (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField label="Name" error={errors.name?.message} {...register('name')} />
                  <TextField label="Contact person" {...register('contact_person')} />
                </div>
                <IdDocumentPicker
                  label="Registration document"
                  hint="A photo or scan of the supplier's registration document, or a PDF. Can be added later from the supplier's page instead."
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
                  <TextField label="City" {...register('city')} />
                  <TextField label="Country" {...register('country')} />
                </div>
                <TextField label="Address" {...register('address')} />
              </>
            )}

            {step.id === 'materials' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/50">
                    Which raw materials this supplier can provide, and how much of each (annually -- see the hint
                    on Supply capacity below). At least one is required. Onboarding date and last transaction date
                    are recorded automatically -- there's nothing to fill in for those.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setMaterialLines((prev) => [...prev, emptyMaterialLine()])}
                  >
                    Add line
                  </Button>
                </div>

                <Alert variant="error">{materialsError}</Alert>

                {materialLines.length === 0 ? (
                  <p className="py-6 text-center text-sm text-white/40">
                    No materials added yet -- add at least one this supplier can provide.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {materialLines.map((line) => {
                      const selectedMaterial = rawMaterials.find((opt) => opt.id === line.raw_material_id)
                      return (
                      <div
                        key={line.key}
                        className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end"
                      >
                        <div className="sm:col-span-7">
                          <SelectField
                            label="Raw material"
                            value={line.raw_material_id || ''}
                            onChange={(e) => updateMaterialLine(line.key, { raw_material_id: Number(e.target.value) })}
                          >
                            <option value="">Choose…</option>
                            {rawMaterials.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.code} — {opt.name}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                        <div className="sm:col-span-4">
                          <TextField
                            label="Supply capacity (per year)"
                            type="number"
                            step="0.0001"
                            hint={`How much this supplier can provide in a year${selectedMaterial ? `, in ${selectedMaterial.unit}` : ''}.`}
                            value={line.max_supply_quantity}
                            onChange={(e) => updateMaterialLine(line.key, { max_supply_quantity: Number(e.target.value) })}
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Button variant="ghost" size="sm" type="button" onClick={() => removeMaterialLine(line.key)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {step.id === 'terms' && (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <TextField
                    label="Payment terms (days)"
                    type="number"
                    error={errors.payment_terms_days?.message}
                    {...register('payment_terms_days')}
                  />
                  <SelectField label="Mode of supply" {...register('mode_of_supply')}>
                    <option value="">Not set</option>
                    <option value="direct">Direct</option>
                    <option value="distributor">Distributor</option>
                    <option value="broker">Broker</option>
                    <option value="import">Import</option>
                  </SelectField>
                </div>
                <SelectField label="Rating" error={errors.rating?.message} {...register('rating')}>
                  <option value="">Not rated</option>
                  <option value="1">★☆☆☆☆ (1)</option>
                  <option value="2">★★☆☆☆ (2)</option>
                  <option value="3">★★★☆☆ (3)</option>
                  <option value="4">★★★★☆ (4)</option>
                  <option value="5">★★★★★ (5)</option>
                </SelectField>
                <input type="hidden" {...register('status')} />
              </>
            )}

            {isLastStep && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-white/50">
                  Review the details below, then create the supplier. It starts in onboarding status
                  &ldquo;Pending&rdquo; -- move it through review from its detail page once it&rsquo;s created.
                </p>
                <SelectField label="Status" {...register('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </SelectField>
                <dl className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2">
                  <ReviewField label="Name" value={values.name} />
                  <ReviewField label="Contact person" value={values.contact_person} />
                  <ReviewField label="Email" value={values.email} />
                  <ReviewField label="Phone" value={values.phone} />
                  <ReviewField label="City" value={values.city} />
                  <ReviewField label="Country" value={values.country} />
                  <ReviewField label="Address" value={values.address} />
                  <ReviewField label="Payment terms" value={`${values.payment_terms_days || 0} days`} />
                  <ReviewField
                    label="Mode of supply"
                    value={values.mode_of_supply ? MODE_OF_SUPPLY_LABELS[values.mode_of_supply] : undefined}
                  />
                  <ReviewField label="Rating" value={values.rating ? `${values.rating} / 5` : undefined} />
                  <ReviewField
                    label="Materials supplied"
                    value={materialLines.filter((l) => l.raw_material_id > 0).length || undefined}
                  />
                </dl>
              </div>
            )}

            <div className="mt-2 flex justify-between gap-3">
              <Button variant="ghost" type="button" onClick={() => (stepIndex === 0 ? navigate(-1) : goBack())}>
                {stepIndex === 0 ? 'Cancel' : 'Back'}
              </Button>
              {isLastStep ? (
                // type="button" with an explicit handleSubmit(onSubmit) call, not
                // type="submit" -- see CustomerOnboardingWizardPage's identical
                // button for why: a real click's mousedown-to-mouseup gap can
                // straddle the re-render that turns this button from "Next" into
                // "Create supplier", and a type="submit" button flipping to that
                // type mid-click fires the browser's native submit as its default
                // action, skipping Review entirely. Submitting programmatically
                // instead removes that pathway.
                <Button type="button" isLoading={isSubmitting} onClick={handleSubmit(onSubmit)}>
                  Create supplier
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
