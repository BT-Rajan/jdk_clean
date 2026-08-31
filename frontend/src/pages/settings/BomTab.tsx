import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { GlassCard, SelectField } from '@/components/ui'
import { listProducts } from '@/api/products'
import { useSelectOptions } from '@/hooks/useSelectOptions'
import { BomEditor } from '@/pages/products/BomEditor'

export function BomTab() {
  const productsFetcher = useCallback(() => listProducts({ page: 1, page_size: 200, status: 'active' }), [])
  const { options: products } = useSelectOptions(productsFetcher)
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-6">
        <h2 className="font-display text-lg font-medium text-white">Units of measure</h2>
        <p className="mt-1 text-sm text-white/50">
          Units moved to their own page --{' '}
          <Link to="/units" className="text-gold-300 hover:text-gold-200">
            Master Data -&gt; Materials -&gt; Units of measure
          </Link>
          .
        </p>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="font-display text-lg font-medium text-white">Bill of materials</h2>
        <p className="mt-1 text-sm text-white/50">
          Pick a product to configure what raw materials (or sub-assembly products) go into one unit of it, and how
          much of each. This is what feasibility, MRP, and every reorder-point comparison read from — get it
          precise here and everything downstream that depends on it follows.
        </p>
        <div className="mt-4 max-w-sm">
          <SelectField
            label="Product"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </SelectField>
        </div>
      </GlassCard>

      {selectedProductId !== '' && <BomEditor productId={selectedProductId} canEdit />}
    </div>
  )
}
