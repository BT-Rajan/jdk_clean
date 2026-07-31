import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextareaField, TextField } from '@/components/ui'
import { createPurchaseOrder, getPurchaseOrder, updatePurchaseOrder } from '@/api/purchaseOrders'
import { listSuppliers } from '@/api/suppliers'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import {
  purchaseOrderSchema,
  todayDateInputMin,
  type PurchaseOrderFormValues,
  type PurchaseOrderSubmitValues,
} from '@/lib/validation'

export function PurchaseOrderFormPage() {
  const { id } = useParams()
  return id ? <PurchaseOrderEditForm id={Number(id)} /> : <PurchaseOrderCreateForm />
}

function useSupplierOptions() {
  const fetcher = useCallback(() => listSuppliers({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function useRawMaterialOptions() {
  const fetcher = useCallback(() => listRawMaterials({ page: 1, page_size: 200, status: 'active' }), [])
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
  materials,
}: {
  control: ReturnType<typeof useForm<PurchaseOrderFormValues, unknown, PurchaseOrderSubmitValues>>['control']
  register: ReturnType<typeof useForm<PurchaseOrderFormValues, unknown, PurchaseOrderSubmitValues>>['register']
  watch: ReturnType<typeof useForm<PurchaseOrderFormValues, unknown, PurchaseOrderSubmitValues>>['watch']
  errors: ReturnType<typeof useForm<PurchaseOrderFormValues, unknown, PurchaseOrderSubmitValues>>['formState']['errors']
  materials: { id: number; code: string; name: string }[]
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
          onClick={() => append({ raw_material_id: 0, quantity: 1, unit_price: 0, discount_percent: 0 })}
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
                <SelectField label="Raw material" {...register(`lines.${index}.raw_material_id` as const)}>
                  <option value="">Choose…</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
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

function PurchaseOrderCreateForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const { options: suppliers } = useSupplierOptions()
  const { options: materials } = useRawMaterialOptions()

  // Prefills from an MRP suggested-purchase link: /purchase-orders/new
  // ?supplier_id=1&raw_material_id=3&quantity=250 -- so acting on MRP's
  // "buy X from Y" output is a single click rather than re-entering it.
  const prefillSupplierId = searchParams.get('supplier_id')
  const prefillMaterialId = searchParams.get('raw_material_id')
  const prefillQuantity = searchParams.get('quantity')

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseOrderFormValues, unknown, PurchaseOrderSubmitValues>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      supplier_id: prefillSupplierId ? Number(prefillSupplierId) : 0,
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: '',
      notes: '',
      lines: [
        {
          raw_material_id: prefillMaterialId ? Number(prefillMaterialId) : 0,
          quantity: prefillQuantity ? Number(prefillQuantity) : 1,
          unit_price: 0,
        },
      ],
    },
  })

  async function onSubmit(values: PurchaseOrderSubmitValues) {
    setFormError(null)
    try {
      const created = await createPurchaseOrder(values)
      navigate(`/purchase-orders/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New purchase order">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <SelectField label="Supplier" error={errors.supplier_id?.message} {...register('supplier_id')}>
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
            ))}
          </SelectField>
          <TextField label="Order date" type="date" min={todayDateInputMin} error={errors.order_date?.message} {...register('order_date')} />
          <TextField label="Expected delivery" type="date" min={todayDateInputMin} error={errors.expected_delivery_date?.message} {...register('expected_delivery_date')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <TextField
            label="Tax rate (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="Leave blank to use the default (0% -- Kuwait has no GST/VAT)"
            error={errors.tax_rate?.message}
            {...register('tax_rate')}
          />
        </div>

        <LineItemsEditor control={control} register={register} watch={watch} errors={errors} materials={materials} />

        <TextareaField label="Notes" {...register('notes')} />

        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create purchase order</Button>
        </div>
      </form>
    </FormShell>
  )
}

function PurchaseOrderEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const { options: suppliers } = useSupplierOptions()
  const { options: materials } = useRawMaterialOptions()

  const {
    register,
    control,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseOrderFormValues, unknown, PurchaseOrderSubmitValues>({
    resolver: zodResolver(purchaseOrderSchema),
  })

  useEffect(() => {
    getPurchaseOrder(id)
      .then((po) => {
        reset({
          supplier_id: po.supplier_id,
          order_date: po.order_date,
          expected_delivery_date: po.expected_delivery_date ?? '',
          notes: po.notes ?? '',
          lines: po.lines.map((l) => ({
            raw_material_id: l.raw_material_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: PurchaseOrderSubmitValues) {
    setFormError(null)
    try {
      await updatePurchaseOrder(id, values)
      navigate(`/purchase-orders/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit purchase order">
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <SelectField label="Supplier" error={errors.supplier_id?.message} {...register('supplier_id')}>
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
              ))}
            </SelectField>
            <TextField label="Order date" type="date" min={todayDateInputMin} error={errors.order_date?.message} {...register('order_date')} />
            <TextField label="Expected delivery" type="date" min={todayDateInputMin} error={errors.expected_delivery_date?.message} {...register('expected_delivery_date')} />
          </div>

          <LineItemsEditor control={control} register={register} watch={watch} errors={errors} materials={materials} />

          <TextareaField label="Notes" {...register('notes')} />

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      )}
    </FormShell>
  )
}
