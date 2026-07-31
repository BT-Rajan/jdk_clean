import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { deleteCustomer, getCustomer, restoreCustomer } from '@/api/customers'
import { listFeasibilities } from '@/api/feasibilities'
import { listQuotations } from '@/api/quotations'
import { listOrders } from '@/api/orders'
import type { Customer } from '@/types/customer'
import type { Feasibility } from '@/types/feasibility'
import type { Quotation } from '@/types/quotation'
import type { Order } from '@/types/order'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/dateFormat'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'

function ActivitySection<T>({
  title,
  items,
  count,
  renderRow,
}: {
  title: string
  items: T[]
  count: number
  renderRow: (item: T) => { key: number | string; content: ReactNode }
}) {
  if (count === 0) return null
  return (
    <GlassCard className="p-6">
      <h2 className="mb-4 font-display text-base font-medium text-white">
        {title} <span className="text-sm text-white/40">({count})</span>
      </h2>
      <div className="space-y-2">
        {items.map((item) => {
          const { key, content } = renderRow(item)
          return <div key={key}>{content}</div>
        })}
      </div>
    </GlassCard>
  )
}

export function CustomerDetailPage() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [feasibilityChecks, setFeasibilityChecks] = useState<Feasibility[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    getCustomer(customerId)
      .then(setCustomer)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [customerId])

  useEffect(() => {
    listFeasibilities({ page: 1, page_size: 10, customer_id: customerId })
      .then((res) => setFeasibilityChecks(res.items))
      .catch(() => setFeasibilityChecks([]))
    listQuotations({ page: 1, page_size: 10, customer_id: customerId })
      .then((res) => setQuotations(res.items))
      .catch(() => setQuotations([]))
    listOrders({ page: 1, page_size: 10, customer_id: customerId })
      .then((res) => setOrders(res.items))
      .catch(() => setOrders([]))
  }, [customerId])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteCustomer(customerId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Customer deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreCustomer(customerId)
      setCustomer(restored)
      setJustDeleted(false)
      setNotice('Customer restored.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Spinner size={28} className="text-gold-300" />
        </div>
      </AppLayout>
    )
  }

  if (!customer) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Customer not found.'}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageHeader
        title={customer.name}
        subtitle={customer.code}
        actions={
          canWrite(user?.role) && !justDeleted ? (
            <>
              <Button variant="ghost" onClick={() => navigate(`/customers/${customerId}/edit`)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <Alert variant="error">{error}</Alert>
      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span>{notice}</span>
          {justDeleted && canWrite(user?.role) && (
            <button type="button" onClick={handleRestore} className="font-medium text-gold-300 underline">
              Undo
            </button>
          )}
        </div>
      )}

      <GlassCard className="p-8">
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Status" value={<StatusBadge status={customer.status} />} />
          <Field label="Contact person" value={customer.contact_person} />
          <Field label="Email" value={customer.email} />
          <Field label="Phone" value={customer.phone} />
          <Field label="City" value={customer.city} />
          <Field label="Country" value={customer.country} />
          <Field label="Credit limit" value={formatCurrency(customer.credit_limit)} />
          <Field label="Payment terms" value={`${customer.payment_terms_days} days`} />
        </dl>
      </GlassCard>

      <div className="mt-6 flex flex-col gap-6">
        <ActivitySection
          title="Feasibility checks"
          items={feasibilityChecks}
          count={feasibilityChecks.length}
          renderRow={(f) => ({
            key: f.id,
            content: (
              <Link
                to={`/feasibilities/${f.id}`}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
              >
                <span className="font-medium text-white">{f.feasibility_number}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-white/40">{formatDate(f.created_at)}</span>
                  <StatusBadge status={f.status} />
                </span>
              </Link>
            ),
          })}
        />

        <ActivitySection
          title="Quotations"
          items={quotations}
          count={quotations.length}
          renderRow={(q) => ({
            key: q.id,
            content: (
              <Link
                to={`/quotations/${q.id}`}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
              >
                <span className="font-medium text-white">{q.quotation_number}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-white/40">{formatCurrency(q.total_amount)}</span>
                  <StatusBadge status={q.status} />
                </span>
              </Link>
            ),
          })}
        />

        <ActivitySection
          title="Orders"
          items={orders}
          count={orders.length}
          renderRow={(o) => ({
            key: o.id,
            content: (
              <Link
                to={`/orders/${o.id}`}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-white/20"
              >
                <span className="font-medium text-white">{o.order_number}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-white/40">{formatCurrency(o.total_amount)}</span>
                  <StatusBadge status={o.status} />
                </span>
              </Link>
            ),
          })}
        />
      </div>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/customers" id={customerId} />
      </div>

      <div className="mt-6">
        <Link to="/customers" className="text-sm text-white/50 hover:text-white">
          ← Back to customers
        </Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete customer"
        message={`Delete ${customer.name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
