import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Modal, SelectField, TextareaField, TextField } from '@/components/ui'
import { logProduction } from '@/api/production'
import { listProducts } from '@/api/products'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
import {
  productionQuickLogSchema,
  type ProductionQuickLogFormValues,
  type ProductionQuickLogSubmitValues,
} from '@/lib/validation'
import type { ProductionBatch } from '@/types/production'

function useProductOptions() {
  const fetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

export interface LogProductionModalProps {
  open: boolean
  onClose: () => void
  onLogged: (batch: ProductionBatch) => void
  /** ISO date (YYYY-MM-DD) to log this batch against -- defaults to
   * today (server-side) when omitted, e.g. the Production list's
   * button. The calendar's day-actions popup passes the clicked day. */
  defaultDate?: string
}

/** For output that's already happened -- see
 * backend/app/services/production_service.py's log_production. Shared
 * by the Production list's "Log production" button and the calendar's
 * day-actions popup. */
export function LogProductionModal({ open, onClose, onLogged, defaultDate }: LogProductionModalProps) {
  const { options: products } = useProductOptions()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductionQuickLogFormValues, unknown, ProductionQuickLogSubmitValues>({
    resolver: zodResolver(productionQuickLogSchema),
    defaultValues: { product_id: 0, quantity: 1, notes: '' },
  })

  useEffect(() => {
    if (open) {
      setFormError(null)
      reset({ product_id: 0, quantity: 1, notes: '' })
    }
  }, [open, reset])

  async function onSubmit(values: ProductionQuickLogSubmitValues) {
    setFormError(null)
    try {
      const batch = await logProduction({
        product_id: values.product_id,
        quantity: values.quantity,
        notes: values.notes || undefined,
        entry_date: defaultDate,
      })
      onLogged(batch)
      onClose()
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <Modal open={open} title="Log production" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <p className="text-xs text-white/40">
          For output that's already happened -- creates and completes a batch in one step, consuming raw materials
          per the product's formula and adding the finished goods to stock right away.
          {defaultDate && <> Logged against <span className="text-white/60">{formatDate(defaultDate)}</span>.</>}
        </p>
        <Alert variant="error">{formError}</Alert>
        <SelectField label="Product" error={errors.product_id?.message} {...register('product_id')}>
          <option value="">Choose…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </SelectField>
        <TextField
          label="Quantity produced"
          type="number"
          step="0.0001"
          error={errors.quantity?.message}
          {...register('quantity')}
        />
        <TextareaField label="Notes (optional)" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Log production</Button>
        </div>
      </form>
    </Modal>
  )
}
