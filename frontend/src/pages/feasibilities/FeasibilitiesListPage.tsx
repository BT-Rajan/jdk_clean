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
} from '@/components/ui'
import { listFeasibilities } from '@/api/feasibilities'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { formatDateTime } from '@/lib/dateFormat'

export function FeasibilitiesListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) => listFeasibilities(params),
    [],
  )
  const {
    items,
    total,
    totalPages,
    page,
    setPage,
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
          <h1 className="font-display text-3xl font-medium text-white">Feasibility Checks</h1>
          <p className="mt-2 text-sm text-white/50">{total} on file</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-44">
            <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="feasible">Feasible</option>
              <option value="exception_pending">Exception pending</option>
              <option value="exception_approved">Exception approved</option>
              <option value="exception_rejected">Exception rejected</option>
              <option value="closed">Closed</option>
              <option value="converted">Converted</option>
              <option value="expired">Expired</option>
            </SelectField>
          </div>
          {canWriteDepartment(user, 'sales') && <Button onClick={() => navigate('/feasibilities/new')}>New check</Button>}
        </div>
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No feasibility checks found" message="Try a different status filter or create a new check." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Number" field="feasibility_number" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <SortableHeader label="Status" field="status" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Checked</th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => (
                  <tr key={f.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/feasibilities/${f.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {f.feasibility_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{f.customer_name ?? '—'}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="px-6 py-4 text-white/60">{f.checked_at ? formatDateTime(f.checked_at) : '—'}</td>
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
