import { useCallback, useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Modal, SelectField, TextareaField, TextField } from '@/components/ui'
import { logSale } from '@/api/orders'
import { listCustomers } from '@/api/customers'
import { listProducts } from '@/api/products'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import {
  orderQuickLogSchema,
  type OrderQuickLogFormValues,
  type OrderQuickLogSubmitValues,
} from '@/lib/validation'
import type { Order } from '@/types/order'

function useCustomerOptions() {
  const fetcher = useCallback(() => listCustomers({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function useProductOptions() {
  const fetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

const EMPTY_LINE = { product_id: 0, quantity: 1, unit_price: 0 }

export interface LogSaleModalProps {
  open: boolean
  onClose: () => void
  /** Called after a successful log instead of the default "navigate to
   * the new order" behavior -- e.g. the calendar's day-actions popup
   * uses this to stay put and refresh its daily snapshot instead. */
  onLogged?: (order: Order) => void
  /** ISO date (YYYY-MM-DD) to log this sale against -- defaults to
   * today (server-side) when omitted, e.g. the Orders list's button.
   * The calendar's day-actions popup passes the clicked day. */
  defaultDate?: string
}

/** For a sale that's already happened -- see
 * backend/app/services/order_service.py's log_sale. Shared by the
 * Orders list's "Log a sale" button and the calendar's day-actions
 * popup. */
export function LogSaleModal({ open, onClose, onLogged, defaultDate }: LogSaleModalProps) {
  const navigate = useNavigate()
  const { options: customers } = useCustomerOptions()
  const { options: products } = useProductOptions()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrderQuickLogFormValues, unknown, OrderQuickLogSubmitValues>({
    resolver: zodResolver(orderQuickLogSchema),
    defaultValues: { customer_id: 0, notes: '', lines: [EMPTY_LINE] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  useEffect(() => {
    if (open) {
      setFormError(null)
      reset({ customer_id: 0, notes: '', lines: [EMPTY_LINE] })
    }
  }, [open, reset])

  async function onSubmit(values: OrderQuickLogSubmitValues) {
    setFormError(null)
    try {
      const order = await logSale({
        customer_id: values.customer_id,
        notes: values.notes || undefined,
        entry_date: defaultDate,
        lines: values.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
      })
      onClose()
      if (onLogged) {
        onLogged(order)
      } else {
        navigate(`/orders/${order.id}`)
      }
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <Modal open={open} title="Log a sale" onClose={onClose} wide>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <p className="text-xs text-white/40">
          For a sale that's already happened -- creates the order, confirms it, and issues a delivery note for it in
          one step, straight from stock on hand. Requires enough finished-goods stock for every line.
          {defaultDate && <> Logged against <span className="text-white/60">{formatDate(defaultDate)}</span>.</>}
        </p>
        <Alert variant="error">{formError}</Alert>
        <SelectField label="Customer" error={errors.customer_id?.message} {...register('customer_id')}>
          <option value="">Choose…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
          ))}
        </SelectField>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-medium text-white">Line items</h2>
            <Button variant="ghost" size="sm" type="button" onClick={() => append(EMPTY_LINE)}>Add line</Button>
          </div>
          {errors.lines?.message && <p className="mb-3 text-xs text-red-400">{errors.lines.message}</p>}
          <div className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-6">
                  <SelectField
                    label="Product"
                    error={errors.lines?.[index]?.product_id?.message}
                    {...register(`lines.${index}.product_id` as const, {
                      onChange: (e) => {
                        const product = products.find((p) => p.id === Number(e.target.value))
                        if (product) setValue(`lines.${index}.unit_price`, product.selling_price)
                      },
                    })}
                  >
                    <option value="">Choose…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                    ))}
                  </SelectField>
                </div>
                <div className="sm:col-span-3">
                  <TextField
                    label="Quantity"
                    type="number"
                    step="0.0001"
                    error={errors.lines?.[index]?.quantity?.message}
                    {...register(`lines.${index}.quantity` as const)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    label="Unit price"
                    type="number"
                    step="0.01"
                    error={errors.lines?.[index]?.unit_price?.message}
                    {...register(`lines.${index}.unit_price` as const)}
                  />
                </div>
                <div className="sm:col-span-1">
                  <Button variant="ghost" size="sm" type="button" onClick={() => remove(index)} disabled={fields.length === 1}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <TextareaField label="Notes (optional)" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Log sale</Button>
        </div>
      </form>
    </Modal>
  )
}
