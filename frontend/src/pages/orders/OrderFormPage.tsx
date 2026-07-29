import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, Button, GlassCard, SelectField, Spinner, TextareaField, TextField } from '@/components/ui'
import { createOrder, getOrder, updateOrder } from '@/api/orders'
import { listCustomers } from '@/api/customers'
import { listProducts } from '@/api/products'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { orderSchema, todayDateInputMin, type OrderFormValues, type OrderSubmitValues } from '@/lib/validation'

export function OrderFormPage() {
  const { id } = useParams()
  return id ? <OrderEditForm id={Number(id)} /> : <OrderCreateForm />
}

function useCustomerOptions() {
  const fetcher = useCallback(() => listCustomers({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function useProductOptions() {
  const fetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
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
  products,
}: {
  control: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['control']
  register: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['register']
  watch: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['watch']
  errors: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['formState']['errors']
  products: { id: number; code: string; name: string }[]
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
          onClick={() => append({ product_id: 0, quantity: 1, unit_price: 0 })}
        >
          Add line
        </Button>
      </div>

      {errors.lines?.message && <p className="mb-3 text-xs text-red-400">{errors.lines.message}</p>}

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => {
          const quantity = Number(lines?.[index]?.quantity ?? 0)
          const unitPrice = Number(lines?.[index]?.unit_price ?? 0)
          return (
            <div key={field.id} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-5">
                <SelectField label="Product" {...register(`lines.${index}.product_id` as const)}>
                  <option value="">Choose…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </SelectField>
              </div>
              <div className="sm:col-span-2">
                <TextField label="Quantity" type="number" step="0.0001" {...register(`lines.${index}.quantity` as const)} />
              </div>
              <div className="sm:col-span-2">
                <TextField label="Unit price" type="number" step="0.01" {...register(`lines.${index}.unit_price` as const)} />
              </div>
              <div className="sm:col-span-2 text-sm text-white/60">
                Line total: {formatCurrency(quantity * unitPrice)}
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

function OrderCreateForm() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const { options: customers } = useCustomerOptions()
  const { options: products } = useProductOptions()

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrderFormValues, unknown, OrderSubmitValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customer_id: 0,
      order_date: new Date().toISOString().slice(0, 10),
      requested_delivery_date: '',
      notes: '',
      lines: [{ product_id: 0, quantity: 1, unit_price: 0 }],
    },
  })

  async function onSubmit(values: OrderSubmitValues) {
    setFormError(null)
    try {
      const created = await createOrder(values)
      navigate(`/orders/${created.id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="New order">
      <Alert variant="error">{formError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <SelectField label="Customer" error={errors.customer_id?.message} {...register('customer_id')}>
            <option value="">Choose…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </SelectField>
          <TextField label="Order date" type="date" min={todayDateInputMin} error={errors.order_date?.message} {...register('order_date')} />
          <TextField label="Requested delivery" type="date" min={todayDateInputMin} error={errors.requested_delivery_date?.message} {...register('requested_delivery_date')} />
        </div>

        <LineItemsEditor control={control} register={register} watch={watch} errors={errors} products={products} />

        <TextareaField label="Notes" {...register('notes')} />

        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Create order</Button>
        </div>
      </form>
    </FormShell>
  )
}

function OrderEditForm({ id }: { id: number }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const { options: customers } = useCustomerOptions()
  const { options: products } = useProductOptions()

  const {
    register,
    control,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OrderFormValues, unknown, OrderSubmitValues>({
    resolver: zodResolver(orderSchema),
  })

  useEffect(() => {
    getOrder(id)
      .then((order) => {
        reset({
          customer_id: order.customer_id,
          order_date: order.order_date,
          requested_delivery_date: order.requested_delivery_date ?? '',
          notes: order.notes ?? '',
          lines: order.lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
        })
      })
      .catch((err) => setFormError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, reset])

  async function onSubmit(values: OrderSubmitValues) {
    setFormError(null)
    try {
      await updateOrder(id, values)
      navigate(`/orders/${id}`)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <FormShell title="Edit order">
      <Alert variant="error">{formError}</Alert>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <SelectField label="Customer" error={errors.customer_id?.message} {...register('customer_id')}>
              <option value="">Choose…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </SelectField>
            <TextField label="Order date" type="date" min={todayDateInputMin} error={errors.order_date?.message} {...register('order_date')} />
            <TextField label="Requested delivery" type="date" min={todayDateInputMin} error={errors.requested_delivery_date?.message} {...register('requested_delivery_date')} />
          </div>

          <LineItemsEditor control={control} register={register} watch={watch} errors={errors} products={products} />

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
