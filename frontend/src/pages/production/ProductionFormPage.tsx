import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextareaField, TextField } from '@/components/ui'
import { createProductionBatch, getProductionBatch, updateProductionBatch } from '@/api/production'
import { listProducts } from '@/api/products'
import { listOrders } from '@/api/orders'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  productionBatchSchema,
  todayDateInputMin,
  type ProductionBatchFormValues,
  type ProductionBatchSubmitValues,
} from '@/lib/validation'

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

function useProductOptions() {
  const fetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function useOrderOptions() {
  const fetcher = useCallback(() => listOrders({ page: 1, page_size: 200 }), [])
  return useSelectOptions(fetcher)
}

export function ProductionFormPage() {
  const { id } = useParams()
  return id ? <ProductionEditForm id={Number(id)} /> : <ProductionCreateForm />
}

function ProductionCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const { options: products } = useProductOptions()
  const { options: orders } = useOrderOptions()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductionBatchFormValues, unknown, ProductionBatchSubmitValues>({
    resolver: zodResolver(productionBatchSchema),
    defaultValues: {
      product_id: 0,
      order_id: '',
      planned_quantity: 1,
      scheduled_start: todayDateInputMin,
      scheduled_end: todayDateInputMin,
      notes: '',
    },
  })

  async function onSubmit(values: ProductionBatchSubmitValues) {
    setFormError(null)
    try {
      const created = await createProductionBatch({ ...values, order_id: values.order_id || null })
      navigate(`/production/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New production batch">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SelectField label="Product" error={errors.product_id?.message} {...register('product_id')}>
            <option value="">Choose…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Order (optional)" {...register('order_id')}>
            <option value="">Not tied to an order — for stock</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_number} — {o.customer_name ?? 'Unknown customer'}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField
          label="Planned quantity"
          type="number"
          step="0.0001"
          error={errors.planned_quantity?.message}
          {...register('planned_quantity')}
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextField
            label="Scheduled start"
            type="date"
            min={todayDateInputMin}
            error={errors.scheduled_start?.message}
            {...register('scheduled_start')}
          />
          <TextField
            label="Scheduled end"
            type="date"
            min={todayDateInputMin}
            error={errors.scheduled_end?.message}
            {...register('scheduled_end')}
          />
        </div>
        <TextareaField label="Notes" {...register('notes')} />
        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Schedule batch</Button>
        </div>
      </form>
    </FormShell>
  )
}

function ProductionEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [productLabel, setProductLabel] = useState('')
  const { options: orders } = useOrderOptions()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductionBatchFormValues, unknown, ProductionBatchSubmitValues>({
    resolver: zodResolver(productionBatchSchema),
  })

  useEffect(() => {
    getProductionBatch(id)
      .then((batch) => {
        setProductLabel(batch.product_code ? `${batch.product_code} — ${batch.product_name}` : `#${batch.product_id}`)
        reset({
          product_id: batch.product_id,
          order_id: batch.order_id ?? '',
          planned_quantity: batch.planned_quantity,
          scheduled_start: batch.scheduled_start,
          scheduled_end: batch.scheduled_end,
          notes: batch.notes ?? '',
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: ProductionBatchSubmitValues) {
    setFormError(null)
    try {
      await updateProductionBatch(id, { ...values, order_id: values.order_id || null })
      navigate(`/production/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit production batch">
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-white/55 uppercase">Product</p>
            <p className="text-[15px] text-white">{productLabel}</p>
            <p className="mt-1 text-xs text-white/40">The product can only be set when the batch is created.</p>
          </div>
          <SelectField label="Order (optional)" {...register('order_id')}>
            <option value="">Not tied to an order — for stock</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_number} — {o.customer_name ?? 'Unknown customer'}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Planned quantity"
            type="number"
            step="0.0001"
            error={errors.planned_quantity?.message}
            {...register('planned_quantity')}
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="Scheduled start"
              type="date"
              min={todayDateInputMin}
              error={errors.scheduled_start?.message}
              {...register('scheduled_start')}
            />
            <TextField
              label="Scheduled end"
              type="date"
              min={todayDateInputMin}
              error={errors.scheduled_end?.message}
              {...register('scheduled_end')}
            />
          </div>
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
