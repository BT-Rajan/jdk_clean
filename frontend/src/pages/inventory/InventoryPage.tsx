import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  GlassCard,
  Pagination,
  PageHeader,
  SortableHeader,
  Spinner,
} from '@/components/ui'
import { getLowStock, getMovements } from '@/api/inventory'
import { useAuth } from '@/hooks/useAuth'
import { canAdjustInventory } from '@/lib/roles'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'
import type { LowStockItem, StockMovement } from '@/types/inventory'

const LOW_STOCK_PAGE_SIZE = DEFAULT_PAGE_SIZE
const MOVEMENTS_PAGE_SIZE = DEFAULT_PAGE_SIZE

export function InventoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canAdjust = canAdjustInventory(user?.role)

  // Low stock comes back from the backend as a single unpaginated list (it's
  // inherently bounded -- only materials currently below their reorder
  // point), so pagination and sorting for it happen client-side over the
  // already-fetched array, matching the same page-size/sort-toggle pattern
  // every other table in the app uses.
  const [lowStock, setLowStock] = useState<LowStockItem[]>([])
  const [lowStockPage, setLowStockPage] = useState(1)
  const [lowStockSort, setLowStockSort] = useState('')
  const [lowStockLoading, setLowStockLoading] = useState(true)
  const [lowStockError, setLowStockError] = useState<string | null>(null)

  // Movements is a genuinely large, ever-growing table, so it uses the same
  // server-side page/sort as the rest of the app's list pages.
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [movementsTotal, setMovementsTotal] = useState(0)
  const [movementsTotalPages, setMovementsTotalPages] = useState(1)
  const [movementsPage, setMovementsPage] = useState(1)
  const [movementsSort, setMovementsSort] = useState('')
  const [movementsLoading, setMovementsLoading] = useState(true)
  const [movementsError, setMovementsError] = useState<string | null>(null)

  const loadLowStock = useCallback(async () => {
    setLowStockLoading(true)
    setLowStockError(null)
    try {
      const low = await getLowStock()
      setLowStock(low)
    } catch (err) {
      setLowStockError(getApiErrorMessage(err))
    } finally {
      setLowStockLoading(false)
    }
  }, [])

  const loadMovements = useCallback(async (page: number, sort: string) => {
    setMovementsLoading(true)
    setMovementsError(null)
    try {
      const moves = await getMovements({ page, page_size: MOVEMENTS_PAGE_SIZE, sort: sort || undefined })
      setMovements(moves.items)
      setMovementsTotal(moves.total)
      setMovementsTotalPages(moves.total_pages)
    } catch (err) {
      setMovementsError(getApiErrorMessage(err))
    } finally {
      setMovementsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLowStock()
  }, [loadLowStock])

  useEffect(() => {
    loadMovements(movementsPage, movementsSort)
  }, [loadMovements, movementsPage, movementsSort])

  function toggleMovementsSort(field: string) {
    setMovementsSort((current) => {
      if (current === field) return `-${field}`
      if (current === `-${field}`) return ''
      return field
    })
    setMovementsPage(1)
  }

  function toggleLowStockSort(field: string) {
    setLowStockSort((current) => {
      if (current === field) return `-${field}`
      if (current === `-${field}`) return ''
      return field
    })
    setLowStockPage(1)
  }

  const sortedLowStock = useMemo(() => {
    if (!lowStockSort) return lowStock
    const field = lowStockSort.replace('-', '') as keyof LowStockItem
    const direction = lowStockSort.startsWith('-') ? -1 : 1
    return [...lowStock].sort((a, b) => {
      const av = a[field]
      const bv = b[field]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction
      return String(av).localeCompare(String(bv)) * direction
    })
  }, [lowStock, lowStockSort])

  const lowStockTotalPages = Math.max(1, Math.ceil(sortedLowStock.length / LOW_STOCK_PAGE_SIZE))
  const pagedLowStock = sortedLowStock.slice(
    (lowStockPage - 1) * LOW_STOCK_PAGE_SIZE,
    lowStockPage * LOW_STOCK_PAGE_SIZE,
  )

  return (
    <AppLayout>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels, low-stock alerts, and movement history"
        actions={canAdjust ? <Button onClick={() => navigate('/inventory/adjust')}>Adjust stock</Button> : undefined}
      />

      <div className="flex flex-col gap-6">
        <GlassCard className="overflow-hidden">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="font-display text-lg font-medium text-white">Low stock</h2>
          </div>
          <Alert variant="error">{lowStockError}</Alert>
          {lowStockLoading ? (
            <div className="flex justify-center py-16">
              <Spinner size={24} className="text-gold-300" />
            </div>
          ) : lowStock.length === 0 ? (
            <EmptyState title="Nothing is low" message="Every raw material is above its reorder point." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                      <SortableHeader label="Material" field="name" sort={lowStockSort} onSort={toggleLowStockSort} />
                      <SortableHeader
                        label="On hand"
                        field="quantity_on_hand"
                        sort={lowStockSort}
                        onSort={toggleLowStockSort}
                      />
                      <SortableHeader
                        label="Reorder point"
                        field="reorder_point"
                        sort={lowStockSort}
                        onSort={toggleLowStockSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLowStock.map((item) => (
                      <tr key={item.raw_material_id} className="border-b border-white/5 last:border-0">
                        <td className="px-6 py-4 text-white">
                          {item.code} — {item.name}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone="danger">{`${item.quantity_on_hand}`}</Badge>
                        </td>
                        <td className="px-6 py-4 text-white/60">{item.reorder_point}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 pb-2">
                <Pagination
                  page={lowStockPage}
                  totalPages={lowStockTotalPages}
                  total={sortedLowStock.length}
                  onPageChange={setLowStockPage}
                />
              </div>
            </>
          )}
        </GlassCard>

        <GlassCard className="overflow-hidden">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="font-display text-lg font-medium text-white">Recent movements</h2>
          </div>
          <Alert variant="error">{movementsError}</Alert>
          {movementsLoading ? (
            <div className="flex justify-center py-16">
              <Spinner size={24} className="text-gold-300" />
            </div>
          ) : movements.length === 0 ? (
            <EmptyState title="No movements yet" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                      <SortableHeader
                        label="Date"
                        field="created_at"
                        sort={movementsSort}
                        onSort={toggleMovementsSort}
                      />
                      <th className="px-6 py-4 font-medium">Item</th>
                      <SortableHeader
                        label="Type"
                        field="movement_type"
                        sort={movementsSort}
                        onSort={toggleMovementsSort}
                      />
                      <SortableHeader
                        label="Quantity"
                        field="quantity"
                        sort={movementsSort}
                        onSort={toggleMovementsSort}
                      />
                      <th className="px-6 py-4 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b border-white/5 last:border-0">
                        <td className="px-6 py-4 text-white/60">{formatDateTime(m.created_at)}</td>
                        <td className="px-6 py-4 text-white">
                          {m.item_type} #{m.item_id}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={m.movement_type === 'issue' ? 'danger' : 'success'}>{m.movement_type}</Badge>
                        </td>
                        <td className="px-6 py-4 text-white/60">{m.quantity}</td>
                        <td className="px-6 py-4 text-white/40">{m.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 pb-2">
                <Pagination
                  page={movementsPage}
                  totalPages={movementsTotalPages}
                  total={movementsTotal}
                  onPageChange={setMovementsPage}
                />
              </div>
            </>
          )}
        </GlassCard>
      </div>
    </AppLayout>
  )
}
