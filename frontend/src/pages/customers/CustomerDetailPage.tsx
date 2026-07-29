import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { deleteCustomer, getCustomer, restoreCustomer } from '@/api/customers'
import type { Customer } from '@/types/customer'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'


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

  useEffect(() => {
    getCustomer(customerId)
      .then(setCustomer)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
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
