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
  Spinner,
  StatusBadge,
  TextField,
} from '@/components/ui'
import { listQuotations } from '@/api/quotations'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'

export function QuotationsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fetcher = useCallback(
    (params: { page: number; search?: string; status?: string }) => listQuotations(params),
    [],
  )
  const { items, total, totalPages, page, setPage, searchInput, setSearchInput, status, setStatus, loading, error } =
    usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Quotations</h1>
          <p className="mt-2 text-sm text-white/50">{total} on file</p>
        </div>
        {canWrite(user?.role) && <Button onClick={() => navigate('/quotations/new')}>New quotation</Button>}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
        <TextField
          label="Search"
          placeholder="Quotation number…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="converted">Converted</option>
        </SelectField>
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No quotations found" message="Try a different search or create a new quotation." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Number</th>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Total</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr key={q.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/quotations/${q.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {q.quotation_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{q.customer_name ?? '—'}</td>
                    <td className="px-6 py-4 text-white/60">{q.quotation_date}</td>
                    <td className="px-6 py-4 text-white/60">{q.total_amount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={q.status} />
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
