import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, TextareaField, TextField } from '@/components/ui'
import { createDeliveryNote } from '@/api/deliveryNotes'
import { listOrders } from '@/api/orders'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  deliveryNoteCreateSchema,
  todayDateInputMin,
  type DeliveryNoteCreateFormValues,
  type DeliveryNoteCreateSubmitValues,
} from '@/lib/validation'

export function DeliveryNoteFormPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  // Only orders that are ready_to_ship can get a delivery note (see
  // delivery_note_service.ELIGIBLE_ORDER_STATUS) -- filtering the picker
  // to that status avoids a round trip just to find out an order isn't
  // eligible yet.
  const ordersFetcher = useCallback(
    () => listOrders({ page: 1, page_size: 200, status: 'ready_to_ship' }),
    [],
  )
  const { options: orders } = useSelectOptions(ordersFetcher)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DeliveryNoteCreateFormValues, unknown, DeliveryNoteCreateSubmitValues>({
    resolver: zodResolver(deliveryNoteCreateSchema),
    defaultValues: {
      order_id: 0,
      delivery_date: todayDateInputMin,
      notes: '',
    },
  })

  async function onSubmit(values: DeliveryNoteCreateSubmitValues) {
    setFormError(null)
    try {
      const created = await createDeliveryNote(values)
      navigate(`/delivery-notes/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <AppLayout>
      <PageContainer>
        <h1 className="font-display text-2xl font-medium text-white">New delivery note</h1>
        <GlassCard className="mt-8 p-8">
          <Alert variant="error">{formError}</Alert>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
            <SelectField label="Order" error={errors.order_id?.message} {...register('order_id')}>
              <option value="">Choose an order ready to ship…</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} — {o.customer_name ?? 'Unknown customer'}
                </option>
              ))}
            </SelectField>
            {orders.length === 0 && (
              <p className="text-xs text-white/40">
                No orders are currently ready to ship. An order needs to reach that status before it can get a
                delivery note.
              </p>
            )}
            <TextField
              label="Delivery date"
              type="date"
              min={todayDateInputMin}
              error={errors.delivery_date?.message}
              {...register('delivery_date')}
            />
            <TextareaField label="Notes" {...register('notes')} />
            <p className="text-xs text-white/40">
              Line items are filled in from the order automatically and can be adjusted afterward while this note
              is still a draft.
            </p>
            <div className="mt-2 flex justify-end gap-3">
              <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" isLoading={isSubmitting}>Create delivery note</Button>
            </div>
          </form>
        </GlassCard>
      </PageContainer>
    </AppLayout>
  )
}
