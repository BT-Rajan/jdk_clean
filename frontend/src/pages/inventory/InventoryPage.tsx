import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  GlassCard,
  Pagination,
  PageHeader,
  SelectField,
  SortableHeader,
  Spinner,
  Tabs,
  TextField,
} from '@/components/ui'
import { getFinishedGoodsStock, getMovements, getRawMaterialStock } from '@/api/inventory'
import { useAuth } from '@/hooks/useAuth'
import { canAdjustInventory } from '@/lib/roles'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'
import type {
  AnyMovementType,
  FinishedGoodStockItem,
  InventoryItemType,
  RawMaterialStockItem,
  StockMovement,
} from '@/types/inventory'

const PAGE_SIZE = DEFAULT_PAGE_SIZE
const MOVEMENTS_PAGE_SIZE = DEFAULT_PAGE_SIZE
const SEARCH_DEBOUNCE_MS = 350

const MOVEMENT_TONE: Record<AnyMovementType, 'success' | 'danger' | 'neutral'> = {
  receipt: 'success',
  production_in: 'success',
  return: 'success',
  issue: 'danger',
  production_out: 'danger',
  return_to_supplier: 'danger',
  adjustment: 'neutral',
}

const MOVEMENT_LABEL: Record<AnyMovementType, string> = {
  receipt: 'Receipt',
  issue: 'Issue',
  adjustment: 'Adjustment',
  production_in: 'Production in',
  production_out: 'Production out',
  return: 'Return',
  return_to_supplier: 'Return to supplier',
}

export function InventoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canAdjust = canAdjustInventory(user?.role)
  const [searchParams, setSearchParams] = useSearchParams()

  const [stockTab, setStockTab] = useState<'raw_material' | 'product'>('raw_material')

  // A raw material or product detail page can link in here pre-filtered
  // to just its own movements (?item_type=&item_id=) -- read once on
  // load, same as the item-type dropdown below drives movementsItemType.
  const filterItemType = (searchParams.get('item_type') as InventoryItemType | null) ?? undefined
  const filterItemId = searchParams.get('item_id') ? Number(searchParams.get('item_id')) : undefined

  // Raw materials
  const [rawMaterials, setRawMaterials] = useState<RawMaterialStockItem[]>([])
  const [rmTotal, setRmTotal] = useState(0)
  const [rmTotalPages, setRmTotalPages] = useState(1)
  const [rmPage, setRmPage] = useState(1)
  const [rmSort, setRmSort] = useState('')
  const [rmSearchInput, setRmSearchInput] = useState('')
  const [rmSearch, setRmSearch] = useState('')
  const [rmLowOnly, setRmLowOnly] = useState(false)
  const [rmLoading, setRmLoading] = useState(true)
  const [rmError, setRmError] = useState<string | null>(null)

  // Finished goods
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodStockItem[]>([])
  const [fgTotal, setFgTotal] = useState(0)
  const [fgTotalPages, setFgTotalPages] = useState(1)
  const [fgPage, setFgPage] = useState(1)
  const [fgSort, setFgSort] = useState('')
  const [fgSearchInput, setFgSearchInput] = useState('')
  const [fgSearch, setFgSearch] = useState('')
  const [fgLowOnly, setFgLowOnly] = useState(false)
  const [fgLoading, setFgLoading] = useState(true)
  const [fgError, setFgError] = useState<string | null>(null)

  // Stock movements
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [movementsTotal, setMovementsTotal] = useState(0)
  const [movementsTotalPages, setMovementsTotalPages] = useState(1)
  const [movementsPage, setMovementsPage] = useState(1)
  const [movementsSort, setMovementsSort] = useState('')
  const [movementsItemType, setMovementsItemType] = useState<InventoryItemType | ''>(filterItemType ?? '')
  const [movementsLoading, setMovementsLoading] = useState(true)
  const [movementsError, setMovementsError] = useState<string | null>(null)

  // Debounce each search box before it drives a fetch, matching every
  // other list page's usePagedResource behaviour.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setRmSearch(rmSearchInput)
      setRmPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [rmSearchInput])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFgSearch(fgSearchInput)
      setFgPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [fgSearchInput])

  // Each section's own request counter -- a debounced search (or React's
  // dev-mode double-effect on mount) can have an earlier request still in
  // flight when a later one resolves first; without this guard the
  // earlier, now-stale response can land last and silently overwrite the
  // correct, more recent result. Same pattern usePagedResource uses.
  const rmRequestId = useRef(0)
  const fgRequestId = useRef(0)
  const movementsRequestId = useRef(0)

  const loadRawMaterials = useCallback(async (page: number, sort: string, search: string, lowOnly: boolean) => {
    const thisRequest = ++rmRequestId.current
    setRmLoading(true)
    setRmError(null)
    try {
      const result = await getRawMaterialStock({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        sort: sort || undefined,
        low_only: lowOnly || undefined,
      })
      if (thisRequest !== rmRequestId.current) return
      setRawMaterials(result.items)
      setRmTotal(result.total)
      setRmTotalPages(result.total_pages)
    } catch (err) {
      if (thisRequest === rmRequestId.current) setRmError(getApiErrorMessage(err))
    } finally {
      if (thisRequest === rmRequestId.current) setRmLoading(false)
    }
  }, [])

  const loadFinishedGoods = useCallback(async (page: number, sort: string, search: string, lowOnly: boolean) => {
    const thisRequest = ++fgRequestId.current
    setFgLoading(true)
    setFgError(null)
    try {
      const result = await getFinishedGoodsStock({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        sort: sort || undefined,
        low_only: lowOnly || undefined,
      })
      if (thisRequest !== fgRequestId.current) return
      setFinishedGoods(result.items)
      setFgTotal(result.total)
      setFgTotalPages(result.total_pages)
    } catch (err) {
      if (thisRequest === fgRequestId.current) setFgError(getApiErrorMessage(err))
    } finally {
      if (thisRequest === fgRequestId.current) setFgLoading(false)
    }
  }, [])

  const loadMovements = useCallback(
    async (page: number, sort: string, itemType: InventoryItemType | '', itemId: number | undefined) => {
      const thisRequest = ++movementsRequestId.current
      setMovementsLoading(true)
      setMovementsError(null)
      try {
        const moves = await getMovements({
          page,
          page_size: MOVEMENTS_PAGE_SIZE,
          sort: sort || undefined,
          item_type: itemType || undefined,
          item_id: itemId,
        })
        if (thisRequest !== movementsRequestId.current) return
        setMovements(moves.items)
        setMovementsTotal(moves.total)
        setMovementsTotalPages(moves.total_pages)
      } catch (err) {
        if (thisRequest === movementsRequestId.current) setMovementsError(getApiErrorMessage(err))
      } finally {
        if (thisRequest === movementsRequestId.current) setMovementsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    loadRawMaterials(rmPage, rmSort, rmSearch, rmLowOnly)
  }, [loadRawMaterials, rmPage, rmSort, rmSearch, rmLowOnly])

  useEffect(() => {
    loadFinishedGoods(fgPage, fgSort, fgSearch, fgLowOnly)
  }, [loadFinishedGoods, fgPage, fgSort, fgSearch, fgLowOnly])

  useEffect(() => {
    loadMovements(movementsPage, movementsSort, movementsItemType, filterItemId)
  }, [loadMovements, movementsPage, movementsSort, movementsItemType, filterItemId])

  function clearMovementsFilter() {
    setSearchParams({})
    setMovementsItemType('')
    setMovementsPage(1)
  }

  function toggleRmSort(field: string) {
    setRmSort((current) => (current === field ? `-${field}` : current === `-${field}` ? '' : field))
    setRmPage(1)
  }

  function toggleFgSort(field: string) {
    setFgSort((current) => (current === field ? `-${field}` : current === `-${field}` ? '' : field))
    setFgPage(1)
  }

  function toggleMovementsSort(field: string) {
    setMovementsSort((current) => (current === field ? `-${field}` : current === `-${field}` ? '' : field))
    setMovementsPage(1)
  }

  return (
    <AppLayout>
      <PageHeader
        title="Warehouse"
        subtitle="Stock, stock movements, and where each transaction came from"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => navigate('/reports/inventory-report')}>
              Inventory report
            </Button>
            {canAdjust && <Button onClick={() => navigate('/inventory/adjust')}>Stock adjustment</Button>}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <GlassCard className="overflow-hidden">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="font-display text-lg font-medium text-white">Stock</h2>
            <p className="mt-1 text-xs text-white/40">
              Raw materials are kept at the right level through purchasing. Finished goods are general factory
              stock — released quantity only, not what's still planned or awaiting QC.
            </p>
          </div>
          <Tabs
            className="px-6"
            items={[
              { id: 'raw_material', label: 'Raw materials' },
              { id: 'product', label: 'Finished goods' },
            ]}
            activeId={stockTab}
            onChange={(id) => setStockTab(id as 'raw_material' | 'product')}
          />

          {stockTab === 'raw_material' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div className="w-full max-w-xs">
                  <TextField
                    label="Search"
                    placeholder="Code, name…"
                    value={rmSearchInput}
                    onChange={(e) => setRmSearchInput(e.target.value)}
                  />
                </div>
                <Button
                  variant={rmLowOnly ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setRmLowOnly((v) => !v)
                    setRmPage(1)
                  }}
                >
                  Low only
                </Button>
              </div>
              <Alert variant="error">{rmError}</Alert>
              {rmLoading ? (
                <div className="flex justify-center py-16">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : rawMaterials.length === 0 ? (
                <EmptyState
                  title={rmLowOnly ? 'Nothing is low' : 'No raw materials found'}
                  message={rmLowOnly ? 'Every raw material is above its reorder point.' : 'Try a different search.'}
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                          <SortableHeader label="Material" field="name" sort={rmSort} onSort={toggleRmSort} />
                          <SortableHeader
                            label="On hand"
                            field="quantity_on_hand"
                            sort={rmSort}
                            onSort={toggleRmSort}
                          />
                          <th className="px-6 py-4 font-medium">Available</th>
                          <SortableHeader
                            label="Reorder point"
                            field="reorder_point"
                            sort={rmSort}
                            onSort={toggleRmSort}
                          />
                          <th className="px-6 py-4 font-medium">Incoming</th>
                          <th className="px-6 py-4 font-medium">Required</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rawMaterials.map((item) => (
                          <tr
                            key={item.raw_material_id}
                            className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                          >
                            <td className="px-6 py-4">
                              <Link
                                to={`/raw-materials/${item.raw_material_id}`}
                                className="font-medium text-gold-300 hover:text-gold-200"
                              >
                                {item.code} — {item.name}
                              </Link>
                            </td>
                            <td className="px-6 py-4">
                              <Badge tone={item.is_low ? 'danger' : 'neutral'}>
                                {`${item.quantity_on_hand} ${item.unit}`}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-white/60">
                              <span className={item.quantity_available < 0 ? 'text-red-300' : undefined}>
                                {item.quantity_available} {item.unit}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-white/60">{`${item.reorder_point} ${item.unit}`}</td>
                            <td className="px-6 py-4 text-white/60">
                              {item.incoming_quantity > 0 ? `${item.incoming_quantity} ${item.unit}` : '—'}
                            </td>
                            <td className="px-6 py-4">
                              {item.required_quantity != null ? (
                                <Link to="/mrp" className="text-gold-300 hover:text-gold-200">
                                  {item.required_quantity} {item.unit}
                                  {item.shortfall && item.shortfall > 0 ? ` (short ${item.shortfall})` : ''}
                                </Link>
                              ) : (
                                <span className="text-white/40">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 pb-2">
                    <Pagination page={rmPage} totalPages={rmTotalPages} total={rmTotal} onPageChange={setRmPage} />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div className="w-full max-w-xs">
                  <TextField
                    label="Search"
                    placeholder="Code, name…"
                    value={fgSearchInput}
                    onChange={(e) => setFgSearchInput(e.target.value)}
                  />
                </div>
                <Button
                  variant={fgLowOnly ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setFgLowOnly((v) => !v)
                    setFgPage(1)
                  }}
                >
                  Low only
                </Button>
              </div>
              <Alert variant="error">{fgError}</Alert>
              {fgLoading ? (
                <div className="flex justify-center py-16">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : finishedGoods.length === 0 ? (
                <EmptyState
                  title={fgLowOnly ? 'Nothing is low' : 'No finished goods found'}
                  message={fgLowOnly ? 'Every product is above its reorder point.' : 'Try a different search.'}
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                          <SortableHeader label="Product" field="name" sort={fgSort} onSort={toggleFgSort} />
                          <SortableHeader
                            label="Released stock"
                            field="quantity_on_hand"
                            sort={fgSort}
                            onSort={toggleFgSort}
                          />
                          <th className="px-6 py-4 font-medium">Committed</th>
                          <th className="px-6 py-4 font-medium">Available</th>
                          <SortableHeader
                            label="Reorder point"
                            field="reorder_point"
                            sort={fgSort}
                            onSort={toggleFgSort}
                          />
                          <th className="px-6 py-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finishedGoods.map((item) => (
                          <tr
                            key={item.product_id}
                            className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                          >
                            <td className="px-6 py-4">
                              <Link
                                to={`/products/${item.product_id}`}
                                className="font-medium text-gold-300 hover:text-gold-200"
                              >
                                {item.code} — {item.name}
                              </Link>
                            </td>
                            <td className="px-6 py-4">
                              <Badge tone={item.is_low ? 'danger' : 'neutral'}>
                                {`${item.quantity_on_hand} ${item.unit}`}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-white/60">{`${item.quantity_reserved} ${item.unit}`}</td>
                            <td className="px-6 py-4 text-white/60">
                              <span className={item.quantity_available < 0 ? 'text-red-300' : undefined}>
                                {item.quantity_available} {item.unit}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-white/60">{`${item.reorder_point} ${item.unit}`}</td>
                            <td className="px-6 py-4">
                              <Badge tone={item.product_status === 'active' ? 'success' : 'neutral'}>
                                {item.product_status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 pb-2">
                    <Pagination page={fgPage} totalPages={fgTotalPages} total={fgTotal} onPageChange={setFgPage} />
                  </div>
                </>
              )}
            </>
          )}
        </GlassCard>

        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-medium text-white">Stock movements</h2>
              <p className="mt-1 text-xs text-white/40">
                {filterItemId
                  ? 'Filtered to this item only.'
                  : "What changed, on what item, and where it came from."}
              </p>
            </div>
            <div className="flex items-end gap-3">
              {filterItemId && (
                <Button variant="ghost" size="sm" onClick={clearMovementsFilter}>
                  Clear filter
                </Button>
              )}
              <div className="w-full max-w-[200px]">
                <SelectField
                  label="Item type"
                  value={movementsItemType}
                  disabled={!!filterItemId}
                  onChange={(e) => {
                    setMovementsItemType(e.target.value as InventoryItemType | '')
                    setMovementsPage(1)
                  }}
                >
                  <option value="">All items</option>
                  <option value="raw_material">Raw materials</option>
                  <option value="product">Finished goods</option>
                </SelectField>
              </div>
            </div>
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
                      <th className="px-6 py-4 font-medium">Source</th>
                      <th className="px-6 py-4 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b border-white/5 last:border-0">
                        <td className="px-6 py-4 text-white/60">{formatDateTime(m.created_at)}</td>
                        <td className="px-6 py-4 text-white">
                          {m.item_route && m.item_name ? (
                            <Link to={m.item_route} className="font-medium text-gold-300 hover:text-gold-200">
                              {m.item_name}
                            </Link>
                          ) : (
                            <span className="text-white/40">
                              {m.item_type} #{m.item_id}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={MOVEMENT_TONE[m.movement_type]}>{MOVEMENT_LABEL[m.movement_type]}</Badge>
                        </td>
                        <td className="px-6 py-4 text-white/60">{m.quantity}</td>
                        <td className="px-6 py-4">
                          {m.reference_route && m.reference_label ? (
                            <Link to={m.reference_route} className="text-gold-300 hover:text-gold-200">
                              {m.reference_label}
                            </Link>
                          ) : (
                            <span className="text-white/40">Manual entry</span>
                          )}
                        </td>
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
