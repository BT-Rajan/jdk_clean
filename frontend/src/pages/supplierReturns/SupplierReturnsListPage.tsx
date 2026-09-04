import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Button,
  EmptyState,
  GlassCard,
  Pagination,
  SortableHeader,
  Spinner,
} from '@/components/ui'
import { listSupplierReturns } from '@/api/supplierReturns'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { formatDate } from '@/lib/dateFormat'

export function SupplierReturnsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; sort?: string }) => listSupplierReturns(params),
    [],
  )
  const { items, total, totalPages, page, setPage, sort, toggleSort, loading, error } = usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Supplier returns</h1>
          <p className="mt-2 text-sm text-white/50">{total} supplier returns on file</p>
        </div>
        {canWriteDepartment(user, 'procurement') && (
          <Button onClick={() => navigate('/supplier-returns/new')}>New supplier return</Button>
        )}
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No supplier returns found"
            message="Record one when a delivery fails quality check."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Number" field="return_number" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Supplier</th>
                  <SortableHeader label="Date" field="return_date" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Reason</th>
                  <th className="px-6 py-4 font-medium">Lines</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link
                        to={`/supplier-returns/${r.id}`}
                        className="font-medium text-gold-300 hover:text-gold-200"
                      >
                        {r.return_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{r.supplier_name ?? `#${r.supplier_id}`}</td>
                    <td className="px-6 py-4 text-white/60">{formatDate(r.return_date)}</td>
                    <td className="px-6 py-4 max-w-xs truncate text-white/60">{r.reason}</td>
                    <td className="px-6 py-4 text-white/60">{r.lines.length}</td>
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
