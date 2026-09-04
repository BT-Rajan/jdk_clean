import { useCallback, useState } from 'react'
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
import { listOrders } from '@/api/orders'
import { usePagedResource } from '@/hooks/usePagedResource'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { formatDate } from '@/lib/dateFormat'
import { formatCurrency } from '@/lib/currency'
import { LogSaleModal } from './LogSaleModal'

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
        <div className="flex items-end gap-3">
          <div className="w-44">
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
          {canWriteDepartment(user, 'sales') && (
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => navigate('/orders/new')}>New order</Button>
              <Button onClick={() => setLogOpen(true)}>Log a sale</Button>
            </div>
          )}
        </div>
      </div>

      <LogSaleModal open={logOpen} onClose={() => setLogOpen(false)} />

      <Alert variant="error">{error}</Alert>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={24} className="text-gold-300" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No orders found" message="Try a different status filter or create a new order." />
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
