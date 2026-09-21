import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  EmptyState,
  GlassCard,
  Pagination,
  SelectField,
  SortableHeader,
  Spinner,
  StatusBadge,
} from '@/components/ui'
import { listInvoices } from '@/api/invoices'
import { usePagedResource } from '@/hooks/usePagedResource'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/dateFormat'
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@/types/invoice'

export function InvoicesListPage() {
  const fetcher = useCallback(
    (params: { page: number; page_size?: number; search?: string; status?: string; sort?: string }) => listInvoices(params),
    [],
  )
  const { items, total, totalPages, page, setPage, status, setStatus, sort, toggleSort, loading, error } =
    usePagedResource(fetcher)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Invoices</h1>
          <p className="mt-2 text-sm text-white/50">{total} invoices on file</p>
        </div>
        <div className="w-56">
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((key) => (
              <option key={key} value={key}>{INVOICE_STATUS_LABELS[key]}</option>
            ))}
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
          <EmptyState title="No invoices found" message="Try a different status filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Number" field="invoice_number" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Order</th>
                  <th className="px-6 py-4 font-medium">Total</th>
                  <th className="px-6 py-4 font-medium">Acknowledged</th>
                  <SortableHeader label="Status" field="status" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Created" field="created_at" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/invoices/${inv.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white">{inv.customer_name ?? '—'}</td>
                    <td className="px-6 py-4">
                      <Link to={`/orders/${inv.order_id}`} className="text-white/60 hover:text-white">
                        {inv.order_number ?? inv.order_id}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(inv.total_amount)}</td>
                    <td className="px-6 py-4 text-white/60">{formatCurrency(inv.amount_acknowledged)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-6 py-4 text-white/60">{formatDate(inv.created_at)}</td>
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
