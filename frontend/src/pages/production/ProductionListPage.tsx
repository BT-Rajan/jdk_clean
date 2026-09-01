import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
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
import { listProductionBatches, logProduction } from '@/api/production'
import { listProducts } from '@/api/products'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { formatDate } from '@/lib/dateFormat'
import { getApiErrorMessage } from '@/lib/apiError'
import {
  productionQuickLogSchema,
  type ProductionQuickLogFormValues,
  type ProductionQuickLogSubmitValues,
} from '@/lib/validation'

function useProductOptions() {
  const fetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  return useSelectOptions(fetcher)
}

function LogProductionModal({ open, onClose, onLogged }: { open: boolean; onClose: () => void; onLogged: () => void }) {
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
      await logProduction({ product_id: values.product_id, quantity: values.quantity, notes: values.notes || undefined })
      onLogged()
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

export function ProductionListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [logOpen, setLogOpen] = useState(false)
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) =>
      listProductionBatches(params),
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
    refetch,
  } = usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Production</h1>
          <p className="mt-2 text-sm text-white/50">{total} batches on file</p>
        </div>
        {canWrite(user?.role) && (
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => navigate('/production/new')}>New batch</Button>
            <Button onClick={() => setLogOpen(true)}>Log production</Button>
          </div>
        )}
      </div>

      <LogProductionModal open={logOpen} onClose={() => setLogOpen(false)} onLogged={refetch} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
        <TextField
          label="Search"
          placeholder="Batch number…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="planned">Planned</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
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
          <EmptyState title="No production batches found" message="Try a different search or schedule a new batch." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Batch" field="batch_number" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Product</th>
                  <th className="px-6 py-4 font-medium">Order</th>
                  <SortableHeader label="Scheduled start" field="scheduled_start" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Quantity</th>
                  <SortableHeader label="Status" field="status" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/production/${b.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {b.batch_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">
                      {b.product_code ? `${b.product_code} — ${b.product_name}` : `#${b.product_id}`}
                    </td>
                    <td className="px-6 py-4 text-white/60">{b.order_number ?? '—'}</td>
                    <td className="px-6 py-4 text-white/60">{formatDate(b.scheduled_start)}</td>
                    <td className="px-6 py-4 text-white/60">
                      {b.status === 'completed'
                        ? `${b.produced_quantity} ${b.unit ?? ''}`
                        : `${b.planned_quantity} ${b.unit ?? ''}`}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={b.status} />
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
