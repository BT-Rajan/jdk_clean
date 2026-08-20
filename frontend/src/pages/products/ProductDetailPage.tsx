import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Button, ConfirmDialog, Field, GlassCard, PageHeader, Spinner, StatusBadge } from '@/components/ui'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { deleteProduct, getProduct, restoreProduct } from '@/api/products'
import { getStock } from '@/api/inventory'
import type { Product } from '@/types/product'
import type { StockLevel } from '@/types/inventory'
import { getApiErrorMessage } from '@/lib/apiError'
import { useAuth } from '@/hooks/useAuth'
import { canWrite } from '@/lib/roles'
import { formatCurrency } from '@/lib/currency'
import { BomEditor } from './BomEditor'
import { PackagingEditor } from './PackagingEditor'

export function ProductDetailPage() {
  const { id } = useParams()
  const productId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()

  const [product, setProduct] = useState<Product | null>(null)
  const [stock, setStock] = useState<StockLevel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [justDeleted, setJustDeleted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getProduct(productId)
      .then(setProduct)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
    getStock('product', productId)
      .then(setStock)
      .catch(() => {})
  }, [productId])

  async function handleDelete() {
    setBusy(true)
    try {
      await deleteProduct(productId)
      setConfirmOpen(false)
      setJustDeleted(true)
      setNotice('Product deleted.')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    setBusy(true)
    try {
      const restored = await restoreProduct(productId)
      setProduct(restored)
      setJustDeleted(false)
      setNotice('Product restored.')
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

  if (!product) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Product not found.'}</Alert>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageHeader
        title={product.name}
        subtitle={product.code}
        actions={
          canWrite(user?.role) && !justDeleted ? (
            <>
              <Button variant="ghost" onClick={() => navigate(`/products/${productId}/edit`)}>Edit</Button>
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

      <GlassCard className="mb-6 p-8">
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Status" value={<StatusBadge status={product.status} />} />
          <Field label="Type" value={<Badge tone={product.product_type === 'finished_good' ? 'gold' : 'info'}>{product.product_type}</Badge>} />
          <Field label="Unit" value={product.unit} />
          <Field label="Selling price" value={formatCurrency(product.selling_price)} />
          <Field
            label="On hand"
            value={
              stock
                ? `${stock.quantity_on_hand} ${product.unit}${stock.quantity_reserved ? ` (${stock.quantity_available} available)` : ''}`
                : undefined
            }
          />
          <Field
            label="Batch"
            value={
              product.batch_size && product.batch_production_hours != null
                ? `${product.batch_size} ${product.unit} / ${product.batch_production_hours} hrs`
                : '—'
            }
          />
          <Field
            label="Production hours per unit"
            value={product.production_hours_per_unit ?? '—'}
          />
          <Field label="Workers required" value={product.workers_required ?? '—'} />
        </dl>
      </GlassCard>

      <BomEditor productId={productId} canEdit={canWrite(user?.role)} />

      <div className="mt-6">
        <PackagingEditor productId={productId} canEdit={canWrite(user?.role)} />
      </div>

      <div className="mt-6">
        <HistoryTimeline resourcePath="/api/products" id={productId} />
      </div>

      <div className="mt-6">
        <Link to="/products" className="text-sm text-white/50 hover:text-white">← Back to products</Link>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete product"
        message={`Delete ${product.name}? This can be undone immediately after, but not once you leave this page.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppLayout>
  )
}
