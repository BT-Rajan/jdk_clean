import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, ConfirmDialog, GlassCard, SelectField, Spinner, TextareaField, TextField } from '@/components/ui'
import { checkMaterialConflicts, createQuotation, getQuotation, updateQuotation } from '@/api/quotations'
import { listCustomers } from '@/api/customers'
import { listProducts } from '@/api/products'
import { listAvailableForQuotation } from '@/api/feasibilities'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { useAsyncGuard } from '@/hooks/useAsyncGuard'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import type { Feasibility } from '@/types/feasibility'
import type { MaterialConflict } from '@/types/quotation'
import {
  quotationSchema,
  todayDateInputMin,
  type QuotationFormValues,
  type QuotationSubmitValues,
} from '@/lib/validation'

export function QuotationFormPage() {
  const { id } = useParams()
  return id ? <QuotationEditForm id={Number(id)} /> : <QuotationCreateForm />
}

function useCustomerOptions() {
  const fetcher = useCallback(() => listCustomers({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function useProductOptions() {
  const fetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

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

function LineItemsEditor({
  control,
  register,
  watch,
  errors,
  products,
}: {
  control: ReturnType<typeof useForm<QuotationFormValues, unknown, QuotationSubmitValues>>['control']
  register: ReturnType<typeof useForm<QuotationFormValues, unknown, QuotationSubmitValues>>['register']
  watch: ReturnType<typeof useForm<QuotationFormValues, unknown, QuotationSubmitValues>>['watch']
  errors: ReturnType<typeof useForm<QuotationFormValues, unknown, QuotationSubmitValues>>['formState']['errors']
  products: { id: number; code: string; name: string }[]
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = watch('lines')

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-medium text-white">Line items</h2>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => append({ product_id: 0, quantity: 1, unit_price: 0, discount_percent: 0 })}
        >
          Add line
        </Button>
      </div>

      {errors.lines?.message && <p className="mb-3 text-xs text-red-400">{errors.lines.message}</p>}

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const quantity = Number(lines?.[index]?.quantity ?? 0)
          const unitPrice = Number(lines?.[index]?.unit_price ?? 0)
          const discountPercent = Number(lines?.[index]?.discount_percent ?? 0)
          const lineTotal = quantity * unitPrice * (1 - discountPercent / 100)
          return (
            <div key={field.id} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-4">
                <SelectField label="Product" {...register(`lines.${index}.product_id` as const)}>
                  <option value="">Choose…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </SelectField>
              </div>
              <div className="sm:col-span-2">
                <TextField label="Quantity" type="number" step="0.0001" {...register(`lines.${index}.quantity` as const)} />
              </div>
              <div className="sm:col-span-2">
                <TextField label="Unit price" type="number" step="0.01" {...register(`lines.${index}.unit_price` as const)} />
              </div>
              <div className="sm:col-span-1">
                <TextField label="Disc. %" type="number" step="0.01" min="0" max="100" {...register(`lines.${index}.discount_percent` as const)} />
              </div>
              <div className="sm:col-span-2 text-sm text-white/60">
                Line total: {formatCurrency(lineTotal)}
              </div>
              <div className="sm:col-span-1">
                <Button variant="ghost" size="sm" type="button" onClick={() => remove(index)}>Remove</Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function QuotationCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [feasibilities, setFeasibilities] = useState<Feasibility[]>([])
  const [loadingFeasibilities, setLoadingFeasibilities] = useState(true)
  const [selectedFeasibility, setSelectedFeasibility] = useState<Feasibility | null>(null)
  const { options: customers } = useCustomerOptions()
  const { options: products } = useProductOptions()
  const { busy: submitting, run: runGuarded } = useAsyncGuard()
  const [materialConflicts, setMaterialConflicts] = useState<MaterialConflict[]>([])
  const [conflictConfirmOpen, setConflictConfirmOpen] = useState(false)
  const [pendingValues, setPendingValues] = useState<QuotationSubmitValues | null>(null)

  const {
    register,
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<QuotationFormValues, unknown, QuotationSubmitValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      customer_id: 0,
      feasibility_id: undefined,
      quotation_date: todayDateInputMin,
      valid_until: '',
      notes: '',
      lines: [{ product_id: 0, quantity: 1, unit_price: 0 }],
      language: 'en',
    },
  })

  useEffect(() => {
    setLoadingFeasibilities(true)
    listAvailableForQuotation()
      .then(setFeasibilities)
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoadingFeasibilities(false))
  }, [])

  const handleFeasibilitySelect = (feasibilityId: number) => {
    const feasibility = feasibilities.find((f) => f.id === feasibilityId)
    if (feasibility) {
      setSelectedFeasibility(feasibility)
      // Auto-fill form with feasibility data
      setValue('feasibility_id', feasibility.id)
      setValue('customer_id', feasibility.customer_id)
      setValue(
        'lines',
        feasibility.lines.map((line) => ({
          product_id: line.product_id,
          quantity: line.quantity,
          unit_price: 0, // Will be filled manually
        })),
      )
    }
  }

  // Live material-conflict pre-check: whether these lines, combined with
  // every other still-open quotation's own needs, would claim more of a
  // raw material than is actually available -- "subject to" what a
  // prior quotation (or order, already netted into available stock) has
  // a claim on. Debounced the same way ClientWizard-style duplicate
  // checks are elsewhere in this app, so it doesn't fire on every
  // keystroke.
  const watchedLines = watch('lines')
  useEffect(() => {
    const validLines = (watchedLines || [])
      .filter((l) => Number(l.product_id) > 0 && Number(l.quantity) > 0)
      .map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) }))
    if (validLines.length === 0) {
      setMaterialConflicts([])
      return
    }
    const timeout = setTimeout(() => {
      checkMaterialConflicts(validLines)
        .then(setMaterialConflicts)
        .catch(() => setMaterialConflicts([]))
    }, 400)
    return () => clearTimeout(timeout)
  }, [JSON.stringify(watchedLines)])

  async function onSubmit(values: QuotationSubmitValues) {
    // A conflict needs an explicit "proceed anyway" click every time this
    // fires while one is showing -- see handleConfirmProceed.
    if (materialConflicts.length > 0) {
      setPendingValues(values)
      setConflictConfirmOpen(true)
      return
    }
    setFormError(null)
    try {
      await runGuarded(async () => {
        const created = await createQuotation(values)
        navigate(`/quotations/${created.id}`)
      })
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  async function handleConfirmProceed() {
    if (!pendingValues) return
    setConflictConfirmOpen(false)
    setFormError(null)
    try {
      await runGuarded(async () => {
        const created = await createQuotation({ ...pendingValues, material_conflict_acknowledged: true })
        navigate(`/quotations/${created.id}`)
      })
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setPendingValues(null)
    }
  }

  return (
    <FormShell title="New quotation">
      <Alert variant="error">{formError}</Alert>
      {loadingFeasibilities ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Select Feasibility Check</label>
            <select
              value={selectedFeasibility?.id ?? ''}
              onChange={(e) => handleFeasibilitySelect(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-white/40 transition-colors hover:border-white/20 focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400/30"
            >
              <option value="">Choose a feasibility check…</option>
              {feasibilities.length === 0 ? (
                <option disabled>No available feasibility checks</option>
              ) : (
                feasibilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.feasibility_number} — {f.customer_name} ({f.status})
                  </option>
                ))
              )}
            </select>
            <p className="mt-1 text-xs text-white/40">
              Only feasibility checks ready for quotation are shown (feasible or exception-approved)
            </p>
          </div>

          {selectedFeasibility && (
            <div className="rounded-lg border border-gold-400/20 bg-gold-400/5 p-4">
              <h3 className="font-medium text-gold-200 mb-3">Feasibility Details</h3>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-white/40">Number</dt>
                  <dd className="text-white">{selectedFeasibility.feasibility_number}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Status</dt>
                  <dd className="text-white capitalize">{selectedFeasibility.status.replace(/_/g, ' ')}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Checked At</dt>
                  <dd className="text-white">{selectedFeasibility.checked_at ? formatDateTime(selectedFeasibility.checked_at) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Line Items</dt>
                  <dd className="text-white">{selectedFeasibility.lines.length} product(s)</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <SelectField label="Customer" error={errors.customer_id?.message} {...register('customer_id')}>
              <option value="">Choose…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </SelectField>
            <TextField label="Quotation date" type="date" min={todayDateInputMin} error={errors.quotation_date?.message} {...register('quotation_date')} />
            <TextField label="Valid until" type="date" min={todayDateInputMin} error={errors.valid_until?.message} {...register('valid_until')} />
          </div>

          <div className="max-w-xs">
            <SelectField label="Language" error={errors.language?.message} {...register('language')}>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </SelectField>
            <p className="mt-1 text-xs text-white/40">Which template Print and Email use by default.</p>
          </div>

          <div className="max-w-xs">
            <TextField
              label="Discount (%)"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="Whole-document discount, on top of any per-line discounts"
              error={errors.discount_percent?.message}
              {...register('discount_percent')}
            />
          </div>

        <LineItemsEditor control={control} register={register} watch={watch} errors={errors} products={products} />

        {materialConflicts.length > 0 && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <p className="mb-2 font-medium">Subject to material availability</p>
            <ul className="flex flex-col gap-1 text-xs text-amber-100/90">
              {materialConflicts.map((c) => (
                <li key={c.raw_material_id}>
                  {c.name}: short {c.shortfall} {c.unit} once{' '}
                  {c.competing_quotations.map((cq) => cq.quotation_number).join(', ')} {c.competing_quotations.length === 1 ? 'is' : 'are'} also counted.
                </li>
              ))}
            </ul>
          </div>
        )}

        <TextareaField label="Notes" {...register('notes')} />

        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={submitting}>Create quotation</Button>
        </div>
      </form>
      )}

      <ConfirmDialog
        open={conflictConfirmOpen}
        title="Material availability conflict"
        wide
        message={
          materialConflicts.length > 0
            ? `This quotation's material needs overlap another open quotation: ${materialConflicts
                .map(
                  (c) =>
                    `${c.name} short by ${c.shortfall} ${c.unit} (also needed by ${c.competing_quotations
                      .map((cq) => cq.quotation_number)
                      .join(', ')})`,
                )
                .join('; ')}. Create it anyway?`
            : ''
        }
        confirmLabel="Create anyway"
        busy={submitting}
        onConfirm={handleConfirmProceed}
        onCancel={() => setConflictConfirmOpen(false)}
      />
    </FormShell>
  )
}

function QuotationEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const { options: customers } = useCustomerOptions()
  const { options: products } = useProductOptions()
  const { busy: submitting, run: runGuarded } = useAsyncGuard()
  const [materialConflicts, setMaterialConflicts] = useState<MaterialConflict[]>([])
  const [conflictConfirmOpen, setConflictConfirmOpen] = useState(false)
  const [pendingValues, setPendingValues] = useState<QuotationSubmitValues | null>(null)

  const {
    register,
    control,
    watch,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<QuotationFormValues, unknown, QuotationSubmitValues>({
    resolver: zodResolver(quotationSchema),
  })

  useEffect(() => {
    getQuotation(id)
      .then((quotation) => {
        reset({
          customer_id: quotation.customer_id,
          quotation_date: quotation.quotation_date,
          valid_until: quotation.valid_until ?? '',
          notes: quotation.notes ?? '',
          language: quotation.language,
          lines: quotation.lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  // Same live pre-check as the create form, excluding this quotation's
  // own current lines from "other open quotations" so it doesn't flag
  // against itself.
  const watchedLines = watch('lines')
  useEffect(() => {
    const validLines = (watchedLines || [])
      .filter((l) => Number(l.product_id) > 0 && Number(l.quantity) > 0)
      .map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) }))
    if (validLines.length === 0) {
      setMaterialConflicts([])
      return
    }
    const timeout = setTimeout(() => {
      checkMaterialConflicts(validLines, id)
        .then(setMaterialConflicts)
        .catch(() => setMaterialConflicts([]))
    }, 400)
    return () => clearTimeout(timeout)
  }, [JSON.stringify(watchedLines), id])

  async function onSubmit(values: QuotationSubmitValues) {
    if (materialConflicts.length > 0) {
      setPendingValues(values)
      setConflictConfirmOpen(true)
      return
    }
    setFormError(null)
    try {
      await runGuarded(async () => {
        await updateQuotation(id, values)
        navigate(`/quotations/${id}`)
      })
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  async function handleConfirmProceed() {
    if (!pendingValues) return
    setConflictConfirmOpen(false)
    setFormError(null)
    try {
      await runGuarded(async () => {
        await updateQuotation(id, { ...pendingValues, material_conflict_acknowledged: true })
        navigate(`/quotations/${id}`)
      })
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setPendingValues(null)
    }
  }

  return (
    <FormShell title="Edit quotation">
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
            <SelectField label="Customer" error={errors.customer_id?.message} {...register('customer_id')}>
              <option value="">Choose…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </SelectField>
            <TextField label="Quotation date" type="date" min={todayDateInputMin} error={errors.quotation_date?.message} {...register('quotation_date')} />
            <TextField label="Valid until" type="date" min={todayDateInputMin} error={errors.valid_until?.message} {...register('valid_until')} />
            <TextField label="Feasibility ID" type="number" {...register('feasibility_id')} disabled />
          </div>

          <div className="max-w-xs">
            <SelectField label="Language" error={errors.language?.message} {...register('language')}>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </SelectField>
            <p className="mt-1 text-xs text-white/40">Which template Print and Email use by default.</p>
          </div>

          <LineItemsEditor control={control} register={register} watch={watch} errors={errors} products={products} />

          {materialConflicts.length > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              <p className="mb-2 font-medium">Subject to material availability</p>
              <ul className="flex flex-col gap-1 text-xs text-amber-100/90">
                {materialConflicts.map((c) => (
                  <li key={c.raw_material_id}>
                    {c.name}: short {c.shortfall} {c.unit} once{' '}
                    {c.competing_quotations.map((cq) => cq.quotation_number).join(', ')} {c.competing_quotations.length === 1 ? 'is' : 'are'} also counted.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TextareaField label="Notes" {...register('notes')} />

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={submitting}>Save changes</Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={conflictConfirmOpen}
        title="Material availability conflict"
        wide
        message={
          materialConflicts.length > 0
            ? `These lines' material needs overlap another open quotation: ${materialConflicts
                .map(
                  (c) =>
                    `${c.name} short by ${c.shortfall} ${c.unit} (also needed by ${c.competing_quotations
                      .map((cq) => cq.quotation_number)
                      .join(', ')})`,
                )
                .join('; ')}. Save anyway?`
            : ''
        }
        confirmLabel="Save anyway"
        busy={submitting}
        onConfirm={handleConfirmProceed}
        onCancel={() => setConflictConfirmOpen(false)}
      />
    </FormShell>
  )
}
