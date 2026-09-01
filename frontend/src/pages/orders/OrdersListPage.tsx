import { useCallback, useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  Modal,
  Pagination,
  SelectField,
  SortableHeader,
  Spinner,
  StatusBadge,
  TextareaField,
  TextField,
} from '@/components/ui'
import { listOrders, logSale } from '@/api/orders'
import { listCustomers } from '@/api/customers'
import { listProducts } from '@/api/products'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  orderQuickLogSchema,
  type OrderQuickLogFormValues,
  type OrderQuickLogSubmitValues,
} from '@/lib/validation'

function useCustomerOptions() {
  const fetcher = useCallback(() => listCustomers({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function useProductOptions() {
  const fetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

const EMPTY_LINE = { product_id: 0, quantity: 1, unit_price: 0 }

function LogSaleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        lines: values.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
      })
      onClose()
      navigate(`/orders/${order.id}`)
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

export function OrdersListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [logOpen, setLogOpen] = useState(false)
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) => listOrders(params),
    [],
  )
  const {
    items,
    total,
    totalPages,
    page,
    setPage,
    searchInput,
    setSearchInput,
    status,
    setStatus,
    sort,
    toggleSort,
    loading,
    error,
  } = usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Orders</h1>
          <p className="mt-2 text-sm text-white/50">{total} on file</p>
        </div>
        {canWriteDepartment(user, 'sales') && (
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => navigate('/orders/new')}>New order</Button>
            <Button onClick={() => setLogOpen(true)}>Log a sale</Button>
          </div>
        )}
      </div>

      <LogSaleModal open={logOpen} onClose={() => setLogOpen(false)} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
        <TextField
          label="Search"
          placeholder="Order number…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_production">In production</option>
          <option value="ready_to_ship">Ready to ship</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </SelectField>
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No orders found" message="Try a different search or create a new order." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Number" field="order_number" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <SortableHeader label="Date" field="order_date" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Total" field="total_amount" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Status" field="status" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/orders/${o.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{o.customer_name ?? '—'}</td>
                    <td className="px-6 py-4 text-white/60">{formatDate(o.order_date)}</td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(o.total_amount)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </AppLayout>
  )
}
