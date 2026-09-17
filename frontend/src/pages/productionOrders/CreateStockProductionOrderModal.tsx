import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Modal, SelectField, TextField, TextareaField } from '@/components/ui'
import { createProductionOrder } from '@/api/productionOrders'
import { listProducts } from '@/api/products'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import type { ProductionOrder, ProductionOrderPriority } from '@/types/productionOrder'
import { getApiErrorMessage } from '@/lib/apiError'
import { todayDateInputMin } from '@/lib/validation'

/** Raises a Production Order to build/replenish general Finished Goods
 * stock -- no customer order behind it at all (P8's stock-driven
 * model). See CreateProductionOrderModal.tsx for the order-linked
 * counterpart, reachable from a specific order's own detail page. */
export function CreateStockProductionOrderModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (po: ProductionOrder) => void
}) {
  const fetchProducts = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: products } = useSelectOptions(fetchProducts)

  const [productId, setProductId] = useState<number | ''>('')
  const [plannedQuantity, setPlannedQuantity] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<ProductionOrderPriority>('normal')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setProductId('')
    setPlannedQuantity('')
    setDueDate('')
    setPriority('normal')
    setNotes('')
    setFormError(null)
  }, [open])

  async function handleSubmit() {
    setFormError(null)
    if (!productId) {
      setFormError('Choose which product to produce.')
      return
    }
    const quantity = Number(plannedQuantity)
    if (!quantity || quantity <= 0) {
      setFormError('Enter a valid planned quantity.')
      return
    }
    if (!dueDate) {
      setFormError('Choose a due date.')
      return
    }
    setSubmitting(true)
    try {
      const created = await createProductionOrder({
        product_id: Number(productId),
        planned_quantity: quantity,
        due_date: dueDate,
        priority,
        notes: notes.trim() || undefined,
      })
      onCreated(created)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title="New stock production order" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Alert variant="error">{formError}</Alert>
        <p className="text-xs text-white/40">
          Builds or replenishes general Finished Goods inventory -- not tied to any customer order. The resulting
          stock is available to fulfil any order once QC releases it.
        </p>

        <SelectField
          label="Product"
          value={productId}
          onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Choose a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Planned production quantity"
          type="number"
          step="0.0001"
          min="0"
          value={plannedQuantity}
          onChange={(e) => setPlannedQuantity(e.target.value)}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Due date"
            type="date"
            min={todayDateInputMin}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as ProductionOrderPriority)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </SelectField>
        </div>

        <TextareaField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" isLoading={submitting} onClick={handleSubmit}>
            Create production order
          </Button>
        </div>
      </div>
    </Modal>
  )
}
