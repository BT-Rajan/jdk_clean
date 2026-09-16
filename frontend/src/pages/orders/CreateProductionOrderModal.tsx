import { useEffect, useState } from 'react'
import { Alert, Button, Modal, SelectField, TextField, TextareaField } from '@/components/ui'
import { createProductionOrder, listProductionOrders } from '@/api/productionOrders'
import type { Order } from '@/types/order'
import type { ProductionOrder, ProductionOrderPriority } from '@/types/productionOrder'
import { getApiErrorMessage } from '@/lib/apiError'
import { todayDateInputMin } from '@/lib/validation'

/** Client-side hint only -- the backend re-checks the remaining quantity
 * itself, inside a locked transaction, as the authoritative control (see
 * backend/app/services/production_order_service.py). This is purely so
 * the form can show a sensible default/limit instead of the user finding
 * out only after submitting. */
function useCommittedByLine(orderId: number, open: boolean) {
  const [committed, setCommitted] = useState<Record<number, number>>({})

  useEffect(() => {
    if (!open) return
    listProductionOrders({ order_id: orderId, page: 1, page_size: 200 })
      .then((res) => {
        const totals: Record<number, number> = {}
        for (const po of res.items) {
          if (po.status !== 'cancelled') {
            totals[po.order_detail_id] = (totals[po.order_detail_id] ?? 0) + po.planned_quantity
          }
        }
        setCommitted(totals)
      })
      .catch(() => setCommitted({}))
  }, [orderId, open])

  return committed
}

export function CreateProductionOrderModal({
  open,
  order,
  onClose,
  onCreated,
}: {
  open: boolean
  order: Order
  onClose: () => void
  onCreated: (po: ProductionOrder) => void
}) {
  const committedByLine = useCommittedByLine(order.id, open)
  const [orderDetailId, setOrderDetailId] = useState<number | ''>('')
  const [plannedQuantity, setPlannedQuantity] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<ProductionOrderPriority>('normal')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setOrderDetailId(order.lines.length === 1 ? order.lines[0].id : '')
    setPlannedQuantity('')
    // Pre-fill from the order's own delivery date -- the customer order
    // already carries this, so there's nothing to re-enter unless
    // Production genuinely needs a different internal due date.
    setDueDate(order.confirmed_delivery_date ?? order.requested_delivery_date ?? '')
    setPriority('normal')
    setNotes('')
    setFormError(null)
  }, [open, order])

  const selectedLine = order.lines.find((l) => l.id === orderDetailId)
  const remaining = selectedLine ? selectedLine.quantity - (committedByLine[selectedLine.id] ?? 0) : null

  async function handleSubmit() {
    setFormError(null)
    if (!orderDetailId) {
      setFormError('Choose which line to produce.')
      return
    }
    const quantity = Number(plannedQuantity)
    if (!quantity || quantity <= 0) {
      setFormError('Enter a valid planned quantity.')
      return
    }
    if (remaining !== null && quantity > remaining) {
      setFormError(`Cannot exceed the remaining order quantity (${remaining} ${selectedLine?.unit ?? ''}).`)
      return
    }
    if (!dueDate) {
      setFormError('Choose a due date.')
      return
    }
    setSubmitting(true)
    try {
      const created = await createProductionOrder({
        order_id: order.id,
        order_detail_id: Number(orderDetailId),
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
    <Modal open={open} title={`Create production order — ${order.order_number}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Alert variant="error">{formError}</Alert>

        {order.lines.length > 1 && (
          <SelectField
            label="Line"
            value={orderDetailId}
            onChange={(e) => setOrderDetailId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Choose a line…</option>
            {order.lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.product_code ? `${line.product_code} — ${line.product_name}` : `#${line.product_id}`} (
                {line.quantity} {line.unit})
              </option>
            ))}
          </SelectField>
        )}

        {selectedLine && (
          <p className="text-xs text-white/40">
            {selectedLine.quantity} {selectedLine.unit} ordered — {remaining} {selectedLine.unit} remaining to commit
            to production.
          </p>
        )}

        <TextField
          label="Planned production quantity"
          type="number"
          step="0.0001"
          min="0"
          max={remaining ?? undefined}
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
