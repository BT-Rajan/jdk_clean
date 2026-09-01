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

interface ProductOption {
  id: number
  code: string
  name: string
  selling_price?: number
}

function LineItemsEditor({
  control,
  register,
  watch,
  setValue,
  errors,
  products,
}: {
  control: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['control']
  register: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['register']
  watch: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['watch']
  setValue: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['setValue']
  errors: ReturnType<typeof useForm<OrderFormValues, unknown, OrderSubmitValues>>['formState']['errors']
  products: ProductOption[]
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = watch('lines')
  const documentDiscountPercent = Number(watch('discount_percent') || 0)

  const lineTotals = (lines ?? []).map((line) => {
    const quantity = Number(line?.quantity ?? 0)
    const unitPrice = Number(line?.unit_price ?? 0)
    const discountPercent = Number(line?.discount_percent ?? 0)
    return quantity * unitPrice * (1 - discountPercent / 100)
  })
  const subtotal = lineTotals.reduce((sum, t) => sum + t, 0)
  const discountAmount = subtotal * (documentDiscountPercent / 100)
  const total = subtotal - discountAmount

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-medium text-white">Line items</h2>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => append({ product_id: 0, quantity: 1, unit_price: 0, discount_percent: 0 })}
        >
          Add line
        </Button>
      </div>

      {errors.lines?.message && <p className="mb-3 text-xs text-red-400">{errors.lines.message}</p>}

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-4">
              <SelectField
                label="Product"
                error={errors.lines?.[index]?.product_id?.message}
                {...register(`lines.${index}.product_id` as const, {
                  onChange: (e) => {
                    // A fresh pick always sets the line to that product's
                    // current list price -- same as the "Log a sale"
                    // quick-entry modal -- so Sales starts from a real
                    // number instead of typing every price from memory,
                    // and can still override it by hand afterward.
                    const product = products.find((p) => p.id === Number(e.target.value))
                    if (product) setValue(`lines.${index}.unit_price`, product.selling_price ?? 0)
                  },
                })}
              >
                <option value="">Choose…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </SelectField>
            </div>
            <div className="sm:col-span-2">
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
              <TextField
                label="Disc. %"
                type="number"
                step="0.01"
                min="0"
                max="100"
                error={errors.lines?.[index]?.discount_percent?.message}
                {...register(`lines.${index}.discount_percent` as const)}
              />
            </div>
            <div className="sm:col-span-2 text-sm text-white/60">
              Line total: {formatCurrency(lineTotals[index] ?? 0)}
            </div>
            <div className="sm:col-span-1">
              <Button variant="ghost" size="sm" type="button" onClick={() => remove(index)} disabled={fields.length === 1}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col items-end gap-1 border-t border-white/10 pt-4 text-sm">
        <div className="flex w-full max-w-xs justify-between text-white/50">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {documentDiscountPercent > 0 && (
          <div className="flex w-full max-w-xs justify-between text-white/50">
            <span>Discount ({documentDiscountPercent}%)</span>
            <span>−{formatCurrency(discountAmount)}</span>
          </div>
        )}
        <div className="flex w-full max-w-xs justify-between text-base font-medium text-white">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
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
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrderFormValues, unknown, OrderSubmitValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customer_id: 0,
      order_date: todayDateInputMin,
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

        <div className="max-w-xs">
          <TextField
            label="Discount (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="Whole-document discount, on top of any per-line discounts"
            error={errors.discount_percent?.message}
            {...register('discount_percent')}
          />
        </div>

        <LineItemsEditor control={control} register={register} watch={watch} setValue={setValue} errors={errors} products={products} />

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
    setValue,
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
          // discount_percent -- both the document-level one and each
          // line's own -- has to be carried over explicitly here: saving
          // this form replaces every line wholesale (see order_service.
          // update_order), and a line submitted without discount_percent
          // defaults to 0 server-side, which would silently zero out an
          // existing discount the moment anything else on the order is
          // edited if this field were left unpopulated.
          discount_percent: order.discount_percent,
          lines: order.lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_percent: l.discount_percent,
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

          <div className="max-w-xs">
            <TextField
              label="Discount (%)"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="Whole-document discount, on top of any per-line discounts"
              error={errors.discount_percent?.message}
              {...register('discount_percent')}
            />
          </div>

          <LineItemsEditor control={control} register={register} watch={watch} setValue={setValue} errors={errors} products={products} />

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
