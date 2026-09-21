import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import { listQuotations, recordQuotationFollowup } from '@/api/quotations'
import { listAssignableSalesmen } from '@/api/salesHome'
import type { AssignableSalesman } from '@/api/salesHome'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment, isAdmin } from '@/lib/roles'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { getApiErrorMessage } from '@/lib/apiError'
import type { Quotation } from '@/types/quotation'

/** Highlights the expiry date once it's actually a live concern: red once
 * it's passed (status hasn't caught up to 'expired' yet -- the scheduled
 * scan runs every 6 hours) or amber inside 2 days of it, both only while
 * the quotation is still open ('draft') -- an accepted/rejected/converted
 * quotation's own valid_until isn't something to flag. */
function expiryClassName(q: Quotation): string {
  if (q.status !== 'draft' || !q.valid_until) return 'text-white/60'
  const daysLeft = (new Date(q.valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (daysLeft < 0) return 'font-medium text-red-300'
  if (daysLeft <= 2) return 'font-medium text-amber-300'
  return 'text-white/60'
}

export function QuotationsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [followupBusyId, setFollowupBusyId] = useState<number | null>(null)
  const [followupError, setFollowupError] = useState<string | null>(null)
  // Salesman filter -- Sales Manager / admin only (a salesman only ever
  // sees their own quotations already, via sales_scope). The Sales
  // Home workload table links here with ?assigned_to=<id>.
  const canSeeSalesmen = isAdmin(user?.role) || user?.role === 'department_head'
  const [searchParams] = useSearchParams()
  const [salesmanFilter, setSalesmanFilter] = useState(canSeeSalesmen ? (searchParams.get('assigned_to') ?? '') : '')
  const [salesmen, setSalesmen] = useState<AssignableSalesman[]>([])
  useEffect(() => {
    if (!canSeeSalesmen) return
    listAssignableSalesmen().then(setSalesmen).catch(() => setSalesmen([]))
  }, [canSeeSalesmen])
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) =>
      listQuotations({ ...params, assigned_to: salesmanFilter ? Number(salesmanFilter) : undefined }),
    [salesmanFilter],
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
    refetch,
  } = usePagedResource(fetcher)

  async function handleFollowup(quotationId: number) {
    setFollowupBusyId(quotationId)
    setFollowupError(null)
    try {
      await recordQuotationFollowup(quotationId)
      await refetch()
    } catch (err) {
      setFollowupError(getApiErrorMessage(err))
    } finally {
      setFollowupBusyId(null)
    }
  }

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Quotations</h1>
          <p className="mt-2 text-sm text-white/50">{total} quotations on file</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-44">
            <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="converted">Converted</option>
            </SelectField>
          </div>
          {canSeeSalesmen && (
            <div className="w-48">
              <SelectField label="Salesman" value={salesmanFilter} onChange={(e) => setSalesmanFilter(e.target.value)}>
                <option value="">All salesmen</option>
                {salesmen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {canWriteDepartment(user, 'sales') && <Button onClick={() => navigate('/quotations/new')}>New quotation</Button>}
        </div>
      </div>

      <Alert variant="error">{error}</Alert>
      <Alert variant="error">{followupError}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No quotations found" message="Try a different status filter or create a new quotation." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Number" field="quotation_number" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <SortableHeader label="Date" field="quotation_date" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Expiry" field="valid_until" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Total" field="total_amount" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Status" field="status" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Conversion</th>
                  <SortableHeader label="Follow-up due" field="next_followup_date" sort={sort} onSort={toggleSort} />
                  {canWriteDepartment(user, 'sales') && <th className="px-6 py-4 font-medium">&nbsp;</th>}
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
                    <td className="px-6 py-4 text-white/60">{formatDate(q.quotation_date)}</td>
                    <td className={`px-6 py-4 ${expiryClassName(q)}`}>{formatDate(q.valid_until)}</td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(q.total_amount)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={q.status} />
                    </td>
                    <td className="px-6 py-4" title={q.conversion_block_reasons.join(' ') || undefined}>
                      <StatusBadge status={q.conversion_status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={q.followup_status} />
                        <span className="text-white/40">{formatDate(q.next_followup_date)}</span>
                      </div>
                    </td>
                    {canWriteDepartment(user, 'sales') && (
                      <td className="px-6 py-4">
                        {q.followup_status !== 'completed' && (
                          <Button
                            variant="subtle"
                            size="sm"
                            isLoading={followupBusyId === q.id}
                            onClick={() => handleFollowup(q.id)}
                          >
                            Follow up
                          </Button>
                        )}
                      </td>
                    )}
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
