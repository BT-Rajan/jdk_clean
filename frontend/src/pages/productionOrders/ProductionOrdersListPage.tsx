import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, EmptyState, GlassCard, Pagination, SelectField, SortableHeader, Spinner, StatusBadge } from '@/components/ui'
import { listProductionOrders } from '@/api/productionOrders'
import { usePagedResource } from '@/hooks/usePagedResource'
import { formatDate } from '@/lib/dateFormat'

export function ProductionOrdersListPage() {
  const { items, total, totalPages, page, setPage, status, setStatus, sort, toggleSort, loading, error } =
    usePagedResource(listProductionOrders)

  return (
    <AppLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium text-white">Production Orders</h1>
          <p className="mt-2 text-sm text-white/50">{total} production orders on file</p>
        </div>
        <div className="w-44">
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="cancelled">Cancelled</option>
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
          <EmptyState
            title="No production orders found"
            message="Production orders are created from a confirmed customer order's detail page."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <SortableHeader label="Production order" field="production_order_number" sort={sort} onSort={toggleSort} />
                  <th className="px-6 py-4 font-medium">Customer order</th>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Product</th>
                  <th className="px-6 py-4 font-medium">Planned qty</th>
                  <SortableHeader label="Due date" field="due_date" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Priority" field="priority" sort={sort} onSort={toggleSort} />
                  <SortableHeader label="Status" field="status" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {items.map((po) => (
                  <tr key={po.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <Link to={`/production-orders/${po.id}`} className="font-medium text-gold-300 hover:text-gold-200">
                        {po.production_order_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-white/60">
                      {po.order_id ? (
                        <Link to={`/orders/${po.order_id}`} className="hover:text-white/80">
                          {po.order_number}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-white/60">{po.customer_name ?? '—'}</td>
                    <td className="px-6 py-4 text-white">
                      {po.product_code ? `${po.product_code} — ${po.product_name}` : `#${po.product_id}`}
                    </td>
                    <td className="px-6 py-4 text-white/60">
                      {po.planned_quantity} {po.unit ?? ''}
                    </td>
                    <td className="px-6 py-4 text-white/60">{formatDate(po.due_date)}</td>
                    <td className="px-6 py-4">
                      <Badge tone="neutral">{po.priority}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={po.status} />
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
