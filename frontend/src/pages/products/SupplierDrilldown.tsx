import { useEffect, useState } from 'react'
import { Alert, Badge, GlassCard, Spinner } from '@/components/ui'
import { getProductSuppliers } from '@/api/products'
import { getApiErrorMessage } from '@/lib/apiError'
import type { ProductSuppliersResult } from '@/types/product'

interface SupplierDrilldownProps {
  productId: number
}

/** Admin-only -- mirrors api/products.py:get_product_suppliers. Parent
 * pages must gate rendering this behind isAdmin(user?.role) themselves;
 * the API call underneath also 403s for anyone else regardless. */
export function SupplierDrilldown({ productId }: SupplierDrilldownProps) {
  const [result, setResult] = useState<ProductSuppliersResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getProductSuppliers(productId)
      .then(setResult)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [productId])

  return (
    <GlassCard className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-medium text-white">Suppliers</h2>
        <span className="text-xs text-white/40">Admin only</span>
      </div>
      <p className="mb-4 text-xs text-white/40">
        Every raw material this product's BOM resolves to (through any sub-assembly levels), and who can supply it.
      </p>

      <Alert variant="error">{error}</Alert>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size={20} className="text-gold-300" />
        </div>
      ) : !result || result.materials.length === 0 ? (
        <p className="text-sm text-white/50">No raw materials to trace suppliers for — check the BOM.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {result.materials.map((m) => (
            <div key={m.raw_material_id} className="rounded-xl border border-white/10 p-4">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="font-medium text-white">{m.raw_material_name}</span>
                <span className="text-xs text-white/40">{m.raw_material_code}</span>
              </div>
              {m.suppliers.length === 0 ? (
                <p className="text-sm text-amber-300/80">No supplier on file for this material.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {m.suppliers.map((s) => (
                    <li key={s.supplier_id} className="flex flex-wrap items-center gap-3 text-sm text-white/70">
                      <span className="text-white">{s.supplier_name}</span>
                      <span className="text-white/40">{s.supplier_code}</span>
                      {s.is_default && <Badge tone="gold">Default</Badge>}
                      {s.lead_time_days != null && <span>{s.lead_time_days}d lead time</span>}
                      {s.max_supply_quantity != null && (
                        <span>
                          up to {s.max_supply_quantity} {m.unit}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
