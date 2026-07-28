import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  GlassCard,
  Modal,
  PageHeader,
  SelectField,
  Spinner,
  TextField,
} from '@/components/ui'
import { adjustStock, getLowStock, getMovements } from '@/api/inventory'
import { listProducts } from '@/api/products'
import { listRawMaterials } from '@/api/rawMaterials'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { useAuth } from '@/hooks/useAuth'
import { canAdjustInventory } from '@/lib/roles'
import { getApiErrorMessage } from '@/lib/apiError'
import type { InventoryItemType, LowStockItem, StockMovement } from '@/types/inventory'

const adjustSchema = z.object({
  item_type: z.enum(['product', 'raw_material']),
  item_id: z.coerce.number().int().positive('Choose an item'),
  quantity: z.coerce.number().refine((v) => v !== 0, 'Quantity cannot be 0'),
  movement_type: z.enum(['receipt', 'issue', 'adjustment', 'return']),
  notes: z.string().trim().optional().or(z.literal('')),
})
type AdjustFormValues = z.input<typeof adjustSchema>
type AdjustSubmitValues = z.output<typeof adjustSchema>

export function InventoryPage() {
  const { user } = useAuth()
  const canAdjust = canAdjustInventory(user?.role)

  const [lowStock, setLowStock] = useState<LowStockItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [low, moves] = await Promise.all([
        getLowStock(),
        getMovements({ page: 1, page_size: 25 }),
      ])
      setLowStock(low)
      setMovements(moves.items)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AppLayout>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels, low-stock alerts, and movement history"
        actions={canAdjust ? <Button onClick={() => setModalOpen(true)}>Adjust stock</Button> : undefined}
      />

      <Alert variant="error">{error}</Alert>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} className="text-gold-300" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <GlassCard className="overflow-hidden">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-medium text-white">Low stock</h2>
            </div>
            {lowStock.length === 0 ? (
              <EmptyState title="Nothing is low" message="Every raw material is above its reorder point." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                      <th className="px-6 py-4 font-medium">Material</th>
                      <th className="px-6 py-4 font-medium">On hand</th>
                      <th className="px-6 py-4 font-medium">Reorder point</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((item) => (
                      <tr key={item.raw_material_id} className="border-b border-white/5 last:border-0">
                        <td className="px-6 py-4 text-white">{item.code} — {item.name}</td>
                        <td className="px-6 py-4">
                          <Badge tone="danger">{`${item.quantity_on_hand}`}</Badge>
                        </td>
                        <td className="px-6 py-4 text-white/60">{item.reorder_point}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>

          <GlassCard className="overflow-hidden">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-medium text-white">Recent movements</h2>
            </div>
            {movements.length === 0 ? (
              <EmptyState title="No movements yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Item</th>
                      <th className="px-6 py-4 font-medium">Type</th>
                      <th className="px-6 py-4 font-medium">Quantity</th>
                      <th className="px-6 py-4 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b border-white/5 last:border-0">
                        <td className="px-6 py-4 text-white/60">{new Date(m.created_at).toLocaleString()}</td>
                        <td className="px-6 py-4 text-white">
                          {m.item_type} #{m.item_id}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={m.movement_type === 'issue' ? 'danger' : 'success'}>{m.movement_type}</Badge>
                        </td>
                        <td className="px-6 py-4 text-white/60">{m.quantity}</td>
                        <td className="px-6 py-4 text-white/40">{m.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      <AdjustStockModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false)
          load()
        }}
      />
    </AppLayout>
  )
}

function AdjustStockModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const productsFetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  const materialsFetcher = useCallback(() => listRawMaterials({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: products } = useSelectOptions(productsFetcher)
  const { options: materials } = useSelectOptions(materialsFetcher)

  const {
    register,
    handleSubmit,
    watch,
    reset,
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
      reset()
      onSuccess()
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <Modal open={open} title="Adjust stock" onClose={onClose}>
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <SelectField label="Item type" {...register('item_type')}>
          <option value="raw_material">Raw material</option>
          <option value="product">Product</option>
        </SelectField>
        <SelectField label="Item" error={errors.item_id?.message} {...register('item_id')}>
          <option value="">Choose…</option>
          {(itemType === 'product' ? products : materials).map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.code} — {opt.name}</option>
          ))}
        </SelectField>
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
        <TextField label="Notes" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Save adjustment</Button>
        </div>
      </form>
    </Modal>
  )
}
