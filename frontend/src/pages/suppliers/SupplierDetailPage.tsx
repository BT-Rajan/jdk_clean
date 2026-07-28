import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { deleteSupplier, getSupplier, restoreSupplier } from '@/api/suppliers'
import type { Supplier } from '@/types/supplier'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-white/40 uppercase">{label}</dt>
      <dd className="mt-1 text-[15px] text-white">{value ?? '—'}</dd>
    </div>
  )
}

export function SupplierDetailPage() {
  const { id } = useParams()
  const supplierId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getSupplier(supplierId)
      .then(setSupplier)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [supplierId])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteSupplier(supplierId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Supplier deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreSupplier(supplierId)
      setSupplier(restored)
      setJustDeleted(false)
      setNotice('Supplier restored.')
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

  if (!supplier) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Supplier not found.'}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.code}
        actions={
          canWrite(user?.role) && !justDeleted ? (
            <>
              <Button variant="ghost" onClick={() => navigate(`/suppliers/${supplierId}/edit`)}>Edit</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>
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
          <Field label="Status" value={<StatusBadge status={supplier.status} />} />
          <Field label="Contact person" value={supplier.contact_person} />
          <Field label="Email" value={supplier.email} />
          <Field label="Phone" value={supplier.phone} />
          <Field label="City" value={supplier.city} />
          <Field label="Country" value={supplier.country} />
          <Field label="Payment terms" value={`${supplier.payment_terms_days} days`} />
        </dl>
      </GlassCard>

      <div className="mt-6">
        <Link to="/suppliers" className="text-sm text-white/50 hover:text-white">← Back to suppliers</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete supplier"
        message={`Delete ${supplier.name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
