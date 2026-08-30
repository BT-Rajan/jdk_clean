import { useEffect, useState } from 'react'
import { Alert, Badge, GlassCard, Spinner } from '@/components/ui'
import { getBom } from '@/api/bom'
import type { BomLine } from '@/types/bom'
import { getApiErrorMessage } from '@/lib/apiError'

interface BomTreeProps {
  productId: number
  productCode: string
  productName: string
}

/** Recursive view of a product's bill of materials: sub-assembly lines
 * expand into their own BOM (fetched lazily, on first expand), down to
 * raw materials. This is a separate, read-only view from BomEditor above
 * it on the product page -- it fetches its own root BOM independently
 * rather than sharing BomEditor's editable-line state, so the two stay
 * decoupled and this one only ever reads. */
export function BomTree({ productId, productCode, productName }: BomTreeProps) {
  const [lines, setLines] = useState<BomLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLines(null)
    setError(null)
    getBom(productId)
      .then((data) => {
        if (!cancelled) setLines(data)
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  return (
    <GlassCard className="p-6">
      <h2 className="font-display text-lg font-medium text-white">Bill of materials structure</h2>
      <p className="mt-1 text-sm text-white/50">
        How this product's sub-assemblies nest down to raw materials -- the same components as the editor
        above, laid out as a tree. Click a sub-assembly to expand its own bill of materials.
      </p>

      <Alert variant="error">{error}</Alert>

      <div className="mt-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-white">
          <Badge tone="gold">Product</Badge>
          <span>{productCode} — {productName}</span>
        </div>
        <div className="mt-2 border-l border-white/10 pl-4">
          {lines === null ? (
            <div className="flex justify-center py-6">
              <Spinner size={18} className="text-gold-300" />
            </div>
          ) : lines.length === 0 ? (
            <p className="py-3 text-sm text-white/40">No components.</p>
          ) : (
            lines.map((line) => <BomTreeNode key={line.id} line={line} visited={new Set([productId])} />)
          )}
        </div>
      </div>
    </GlassCard>
  )
}

function BomTreeNode({ line, visited }: { line: BomLine; visited: Set<number> }) {
  const isSubAssembly = line.component_type === 'product'
  // A BOM shouldn't be able to reference itself through its own
  // sub-assemblies (bom_service enforces this on save), but this guard
  // means a stale/legacy cycle renders safely instead of recursing
  // forever, rather than relying solely on that write-time check.
  const isCycle = isSubAssembly && visited.has(line.component_id)

  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<BomLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded || !isSubAssembly || isCycle || children !== null) return
    let cancelled = false
    getBom(line.component_id)
      .then((data) => {
        if (!cancelled) setChildren(data)
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, isSubAssembly, isCycle, line.component_id])

  return (
    <div className="py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {isSubAssembly && !isCycle ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-4 text-white/50 hover:text-white"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Badge tone={isSubAssembly ? 'info' : 'neutral'}>{isSubAssembly ? 'Sub-assembly' : 'Raw material'}</Badge>
        <span className="text-white">
          {line.component_code ?? '—'} — {line.component_name ?? `#${line.component_id}`}
        </span>
        <span className="text-white/40">
          {line.quantity} {line.unit}
          {line.scrap_percent ? ` (+${line.scrap_percent}% scrap)` : ''}
        </span>
        {isCycle && <span className="text-xs text-red-300">Circular reference — not expanded</span>}
      </div>

      {expanded && isSubAssembly && !isCycle && (
        <div className="mt-1 border-l border-white/10 pl-4">
          {error ? (
            <Alert variant="error">{error}</Alert>
          ) : children === null ? (
            <div className="flex justify-center py-3">
              <Spinner size={14} className="text-gold-300" />
            </div>
          ) : children.length === 0 ? (
            <p className="py-2 text-xs text-white/40">No components.</p>
          ) : (
            children.map((child) => (
              <BomTreeNode key={child.id} line={child} visited={new Set([...visited, line.component_id])} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
