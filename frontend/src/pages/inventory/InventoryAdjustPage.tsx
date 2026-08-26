import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, TextField } from '@/components/ui'
import { adjustStock } from '@/api/inventory'
import { listProducts } from '@/api/products'
import { listRawMaterials } from '@/api/rawMaterials'
import { listSuppliers } from '@/api/suppliers'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import type { InventoryItemType } from '@/types/inventory'

const adjustSchema = z
  .object({
    item_type: z.enum(['product', 'raw_material']),
    item_id: z.coerce.number().int().positive('Choose an item'),
    quantity: z.coerce.number().refine((v) => v !== 0, 'Quantity cannot be 0'),
    movement_type: z.enum(['receipt', 'issue', 'adjustment', 'return']),
    notes: z.string().trim().optional().or(z.literal('')),
    // Only actually required when a raw material is being received (see
    // the .superRefine below) -- optional here so the schema accepts the
    // form's default empty values for every other item/movement combo.
    supplier_id: z.coerce.number().int().positive().optional().or(z.literal(0)),
    unit_cost: z.coerce.number().min(0).optional().or(z.literal('' as unknown as number)),
    batch_number: z.string().trim().optional().or(z.literal('')),
    expiry_date: z.string().trim().optional().or(z.literal('')),
    invoice_number: z.string().trim().optional().or(z.literal('')),
    received_by: z.string().trim().optional().or(z.literal('')),
    received_date: z.string().trim().optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    // Raw material arriving at the factory must be traceable -- see
    // backend/app/services/inventory_service.py's adjust_stock for the
    // same requirement enforced server-side. Checked here too so the
    // person sees exactly which field is missing before submitting.
    if (values.item_type !== 'raw_material' || values.movement_type !== 'receipt') return
    if (!values.supplier_id) {
      ctx.addIssue({ code: 'custom', path: ['supplier_id'], message: 'Supplier is required to receive raw material' })
    }
    if (values.unit_cost === undefined || values.unit_cost === ('' as unknown as number)) {
      ctx.addIssue({ code: 'custom', path: ['unit_cost'], message: 'Unit cost is required' })
    }
    if (!values.invoice_number) {
      ctx.addIssue({ code: 'custom', path: ['invoice_number'], message: 'Invoice / delivery note number is required' })
    }
    if (!values.received_by) {
      ctx.addIssue({ code: 'custom', path: ['received_by'], message: 'Who received it is required' })
    }
    if (!values.received_date) {
      ctx.addIssue({ code: 'custom', path: ['received_date'], message: 'Date received is required' })
    }
  })
type AdjustFormValues = z.input<typeof adjustSchema>
type AdjustSubmitValues = z.output<typeof adjustSchema>

// A dedicated route rather than a modal, matching every other create/edit
// flow in the app (customers, suppliers, raw materials, products,
// quotations, orders, users all use a routed FormPage -- a modal here was
// the one exception).
export function InventoryAdjustPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const productsFetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  const materialsFetcher = useCallback(() => listRawMaterials({ page: 1, page_size: 200, status: 'active' }), [])
  const suppliersFetcher = useCallback(() => listSuppliers({ page: 1, page_size: 200 }), [])
  const { options: products } = useSelectOptions(productsFetcher)
  const { options: materials } = useSelectOptions(materialsFetcher)
  const { options: suppliers } = useSelectOptions(suppliersFetcher)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdjustFormValues, unknown, AdjustSubmitValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      item_type: 'raw_material',
      item_id: 0,
      quantity: 0,
      movement_type: 'adjustment',
      notes: '',
      supplier_id: 0,
      unit_cost: '' as unknown as number,
      batch_number: '',
      expiry_date: '',
      invoice_number: '',
      received_by: '',
      received_date: '',
    },
  })
  const itemType = watch('item_type') as InventoryItemType
  const movementType = watch('movement_type')
  const isRawMaterialReceipt = itemType === 'raw_material' && movementType === 'receipt'

  async function onSubmit(values: AdjustSubmitValues) {
    setFormError(null)
    try {
      await adjustStock({
        ...values,
        supplier_id: isRawMaterialReceipt ? values.supplier_id || null : null,
        unit_cost: isRawMaterialReceipt && values.unit_cost !== undefined ? Number(values.unit_cost) : null,
        batch_number: isRawMaterialReceipt ? values.batch_number || null : null,
        expiry_date: isRawMaterialReceipt ? values.expiry_date || null : null,
        invoice_number: isRawMaterialReceipt ? values.invoice_number || null : null,
        received_by: isRawMaterialReceipt ? values.received_by || null : null,
        received_date: isRawMaterialReceipt ? values.received_date || null : null,
      })
      navigate('/inventory')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">Adjust stock</h1>
        <p className="mt-2 text-sm text-white/50">
          Record a receipt, issue, adjustment, or return against a product or raw material.
        </p>
        <GlassCard className="mt-8 p-8">
          <Alert variant="error">{formError}</Alert>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <SelectField label="Item type" {...register('item_type')}>
                <option value="raw_material">Raw material</option>
                <option value="product">Product</option>
              </SelectField>
              <SelectField label="Item" error={errors.item_id?.message} {...register('item_id')}>
                <option value="">Choose…</option>
                {(itemType === 'product' ? products : materials).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.code} — {opt.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <SelectField label="Movement type" {...register('movement_type')}>
                <option value="receipt">Receipt (+)</option>
                <option value="issue">Issue (-)</option>
                <option value="adjustment">Adjustment (+/-)</option>
                <option value="return">Return (+)</option>
              </SelectField>
              <TextField
                label="Quantity"
                type="number"
                step="0.0001"
                hint="Positive to add stock, negative to remove it"
                error={errors.quantity?.message}
                {...register('quantity')}
              />
            </div>
            {isRawMaterialReceipt && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="mb-4 text-sm font-medium text-white/70">
                  Receiving raw material — every field below is required so this shipment can be
                  traced back to a supplier and cost for reporting.
                </p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <SelectField label="Supplier" error={errors.supplier_id?.message} {...register('supplier_id')}>
                    <option value="">Choose…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Unit cost"
                    type="number"
                    step="0.0001"
                    error={errors.unit_cost?.message}
                    {...register('unit_cost')}
                  />
                  <TextField label="Batch / lot number" hint="Optional" {...register('batch_number')} />
                  <TextField label="Expiry date" type="date" hint="Optional" {...register('expiry_date')} />
                  <TextField
                    label="Invoice / delivery note number"
                    error={errors.invoice_number?.message}
                    {...register('invoice_number')}
                  />
                  <TextField
                    label="Received by"
                    error={errors.received_by?.message}
                    {...register('received_by')}
                  />
                  <TextField
                    label="Date received"
                    type="date"
                    error={errors.received_date?.message}
                    {...register('received_date')}
                  />
                </div>
              </div>
            )}
            <TextField label="Notes" {...register('notes')} />
            <div className="mt-2 flex justify-end gap-3">
              <Button variant="ghost" type="button" onClick={() => navigate('/inventory')}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                Save adjustment
              </Button>
            </div>
          </form>
        </GlassCard>
      </PageContainer>
    </AppLayout>
  )
}
