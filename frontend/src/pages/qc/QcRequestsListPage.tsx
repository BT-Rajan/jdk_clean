import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, EmptyState, GlassCard, Pagination, SelectField, Spinner, StatusBadge } from '@/components/ui'
import { listQcRequests } from '@/api/qcRequests'
import { usePagedResource } from '@/hooks/usePagedResource'
import { formatDate } from '@/lib/dateFormat'

/** Discoverability-only list -- Pass 5's one new page. Every action on a
 * QC request (dispatch sample, record report, accept/reject) already
 * lives on ProductionOrderDetailPage's "Quality control" section, so
 * this deliberately has no detail view or write actions of its own;
 * each row links out to the production order that owns it. */
export function QcRequestsListPage() {
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; status?: string }) =>
      listQcRequests({ page: params.page, page_size: params.page_size, status: params.status }),
    [],
  )
  const { items, total, totalPages, page, setPage, status, setStatus, loading, error } = usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Quality check</h1>
          <p className="mt-2 text-sm text-white/50">{total} external QC requests on file</p>
        </div>
        <div className="w-52">
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="requested">Requested</option>
            <option value="sample_sent">Sample sent</option>
            <option value="report_received">Report received</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </SelectField>
        </div>
      </div>

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No QC requests found" message="Try a different status filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Request</th>
                  <th className="px-6 py-4 font-medium">Product</th>
                  <th className="px-6 py-4 font-medium">Production order</th>
                  <th className="px-6 py-4 font-medium">QC agent</th>
                  <th className="px-6 py-4 font-medium">Quantity</th>
                  <th className="px-6 py-4 font-medium">Requested</th>
                  <th className="px-6 py-4 font-medium">Expected report</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((qc) => (
                  <tr key={qc.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link
                        to={`/production-orders/${qc.production_order_id}`}
                        className="font-medium text-gold-300 hover:text-gold-200"
                      >
                        {qc.qc_request_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">
                      {qc.product_code ? `${qc.product_code} — ${qc.product_name}` : (qc.product_name ?? `#${qc.product_id}`)}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/production-orders/${qc.production_order_id}`}
                        className="text-gold-300 hover:text-gold-200"
                      >
                        {qc.production_order_number ?? `#${qc.production_order_id}`}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white/60">{qc.qc_agent_name ?? `#${qc.qc_agent_id}`}</td>
                    <td className="px-6 py-4 text-white/60">{qc.quantity}</td>
                    <td className="px-6 py-4 text-white/60">{formatDate(qc.request_date)}</td>
                    <td className="px-6 py-4 text-white/60">
                      {qc.expected_report_date ? formatDate(qc.expected_report_date) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={qc.status} />
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
