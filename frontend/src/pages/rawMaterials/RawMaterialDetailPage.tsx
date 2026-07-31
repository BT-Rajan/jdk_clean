import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { deleteRawMaterial, getRawMaterial, restoreRawMaterial } from '@/api/rawMaterials'
import { getStock } from '@/api/inventory'
import { getSupplier } from '@/api/suppliers'
import type { RawMaterial } from '@/types/rawMaterial'
import type { StockLevel } from '@/types/inventory'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { formatCurrency } from '@/lib/currency'

export function RawMaterialDetailPage() {
  const { id } = useParams()
  const materialId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [material, setMaterial] = useState<RawMaterial | null>(null)
  const [supplierName, setSupplierName] = useState<string | null>(null)
  const [stock, setStock] = useState<StockLevel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getRawMaterial(materialId)
      .then((m) => {
        setMaterial(m)
        if (m.default_supplier_id) {
          getSupplier(m.default_supplier_id).then((s) => setSupplierName(s.name)).catch(() => {})
        }
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
    getStock('raw_material', materialId)
      .then(setStock)
      .catch(() => {})
  }, [materialId])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteRawMaterial(materialId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Raw material deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreRawMaterial(materialId)
      setMaterial(restored)
      setJustDeleted(false)
      setNotice('Raw material restored.')
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

  if (!material) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Raw material not found.'}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageHeader
        title={material.name}
        subtitle={material.code}
        actions={
          canWrite(user?.role) && !justDeleted ? (
            <>
              <Button variant="ghost" onClick={() => navigate(`/raw-materials/${materialId}/edit`)}>Edit</Button>
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
            <button type="button" onClick={handleRestore} className="font-medium text-gold-300 underline">Undo</button>
          )}
        </div>
      )}

      <GlassCard className="p-8">
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Status" value={<StatusBadge status={material.status} />} />
          <Field label="Unit" value={material.unit} />
          <Field label="Reorder point" value={material.reorder_point} />
          <Field label="Unit cost" value={formatCurrency(material.unit_cost)} />
          <Field label="Default supplier" value={supplierName} />
          <Field
            label="On hand"
            value={
              stock
                ? `${stock.quantity_on_hand} ${material.unit}${stock.quantity_reserved ? ` (${stock.quantity_available} available)` : ''}`
                : undefined
            }
          />
        </dl>
      </GlassCard>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/raw-materials" id={materialId} />
      </div>

      <div className="mt-6">
        <Link to="/raw-materials" className="text-sm text-white/50 hover:text-white">← Back to raw materials</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete raw material"
        message={`Delete ${material.name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
