import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  Pagination,
  SelectField,
  SortableHeader,
  Spinner,
  StatusBadge,
  TextField,
} from '@/components/ui'
import { listProductionBatches } from '@/api/production'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { formatDate } from '@/lib/dateFormat'

export function ProductionListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
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
  } = usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Production</h1>
          <p className="mt-2 text-sm text-white/50">{total} batches on file</p>
        </div>
        {canWrite(user?.role) && <Button onClick={() => navigate('/production/new')}>New batch</Button>}
      </div>

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
