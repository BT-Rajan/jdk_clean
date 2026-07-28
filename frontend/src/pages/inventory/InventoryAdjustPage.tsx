import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, GlassCard, SelectField, TextField } from '@/components/ui'
import { adjustStock } from '@/api/inventory'
import { listProducts } from '@/api/products'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import type { InventoryItemType } from '@/types/inventory'

const adjustSchema = z.object({
  item_type: z.enum(['product', 'raw_material']),
  item_id: z.coerce.number().int().positive('Choose an item'),
  quantity: z.coerce.number().refine((v) => v !== 0, 'Quantity cannot be 0'),
  movement_type: z.enum(['receipt', 'issue', 'adjustment', 'return']),
  notes: z.string().trim().optional().or(z.literal('')),
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
  const { options: products } = useSelectOptions(productsFetcher)
  const { options: materials } = useSelectOptions(materialsFetcher)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdjustFormValues, unknown, AdjustSubmitValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { item_type: 'raw_material', item_id: 0, quantity: 0, movement_type: 'adjustment', notes: '' },
  })
  const itemType = watch('item_type') as InventoryItemType

  async function onSubmit(values: AdjustSubmitValues) {
    setFormError(null)
    try {
      await adjustStock(values)
      navigate('/inventory')
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
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
      </div>
    </AppLayout>
  )
}
