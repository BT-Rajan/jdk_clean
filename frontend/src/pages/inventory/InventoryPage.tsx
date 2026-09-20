import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  TextField,
} from '@/components/ui'
import {
  approveAdjustmentRequest,
  getFinishedGoodsStock,
  getMovements,
  getRawMaterialStock,
  listAdjustmentRequests,
  rejectAdjustmentRequest,
} from '@/api/inventory'
import { useAuth } from '@/hooks/useAuth'
import { canAdjustInventory, isAdmin } from '@/lib/roles'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'
import { DEFAULT_PAGE_SIZE } from '@/lib/constants'
import type {
  FinishedGoodStockItem,
  RawMaterialStockItem,
  RawMaterialType,
  StockAdjustmentRequest,
  StockMovement,
} from '@/types/inventory'

const MOVEMENTS_PAGE_SIZE = DEFAULT_PAGE_SIZE
const FINISHED_GOODS_PAGE_SIZE = DEFAULT_PAGE_SIZE
const RAW_MATERIALS_PAGE_SIZE = DEFAULT_PAGE_SIZE

const MATERIAL_TYPE_LABEL: Record<RawMaterialType, string> = {
  raw_material: 'Raw material',
  packaging: 'Packaging',
  consumable: 'Consumable',
}

/** Links a movement/reservation's reference_type + reference_id to the
 * document that created it -- null when that type has no dedicated
 * detail page to link to (still shown as plain text). */
function referenceLink(referenceType: string | null, referenceId: number | null): string | null {
  if (referenceId === null) return null
  switch (referenceType) {
    case 'order':
      return `/orders/${referenceId}`
    case 'production_order':
      return `/production-orders/${referenceId}`
    case 'production_schedule':
      return `/production/${referenceId}`
    case 'purchase_order':
      return `/purchase-orders/${referenceId}`
    case 'delivery_note':
      return `/delivery-notes/${referenceId}`
    case 'supplier_return':
      return `/supplier-returns/${referenceId}`
    default:
      return null
  }
}

export function InventoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canAdjust = canAdjustInventory(user?.role)

  // Finished goods: server-side page/search/sort like the rest of the
  // app's list pages, plus a client-side "low only" filter toggle.
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodStockItem[]>([])
  const [fgTotal, setFgTotal] = useState(0)
  const [fgTotalPages, setFgTotalPages] = useState(1)
  const [fgPage, setFgPage] = useState(1)
  const [fgSort, setFgSort] = useState('')
  const [fgLowOnly, setFgLowOnly] = useState(false)
  const [fgLoading, setFgLoading] = useState(true)
  const [fgError, setFgError] = useState<string | null>(null)

  const loadFinishedGoods = useCallback(
    async (page: number, sort: string, lowOnly: boolean) => {
      setFgLoading(true)
      setFgError(null)
      try {
        const result = await getFinishedGoodsStock({
          page,
          page_size: FINISHED_GOODS_PAGE_SIZE,
          sort: sort || undefined,
          low_only: lowOnly || undefined,
        })
        setFinishedGoods(result.items)
        setFgTotal(result.total)
        setFgTotalPages(result.total_pages)
      } catch (err) {
        setFgError(getApiErrorMessage(err))
      } finally {
        setFgLoading(false)
      }
    },
    [],
  )

  // Raw materials: same server-side page/search/sort/low-only pattern as
  // finished goods, plus a material_type filter so packaging stock can be
  // viewed independently from ordinary raw material stock.
  const [rawMaterials, setRawMaterials] = useState<RawMaterialStockItem[]>([])
  const [rmTotal, setRmTotal] = useState(0)
  const [rmTotalPages, setRmTotalPages] = useState(1)
  const [rmPage, setRmPage] = useState(1)
  const [rmSort, setRmSort] = useState('')
  const [rmLowOnly, setRmLowOnly] = useState(false)
  const [rmMaterialType, setRmMaterialType] = useState<'' | RawMaterialType>('')
  const [rmLoading, setRmLoading] = useState(true)
  const [rmError, setRmError] = useState<string | null>(null)

  // Movements is a genuinely large, ever-growing table, so it uses the same
  // server-side page/sort as the rest of the app's list pages.
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [movementsTotal, setMovementsTotal] = useState(0)
  const [movementsTotalPages, setMovementsTotalPages] = useState(1)
  const [movementsPage, setMovementsPage] = useState(1)
  const [movementsSort, setMovementsSort] = useState('')
  const [movementsLoading, setMovementsLoading] = useState(true)
  const [movementsError, setMovementsError] = useState<string | null>(null)

  // Pending stock-adjustment approvals -- admin only (see
  // backend/app/services/inventory_service.py's submit_manual_adjustment).
  const isAdminUser = isAdmin(user?.role)
  const [pendingRequests, setPendingRequests] = useState<StockAdjustmentRequest[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [decisionBusyId, setDecisionBusyId] = useState<number | null>(null)
  const [rejectReasonById, setRejectReasonById] = useState<Record<number, string>>({})

  const loadRawMaterials = useCallback(
    async (page: number, sort: string, lowOnly: boolean, materialType: '' | RawMaterialType) => {
      setRmLoading(true)
      setRmError(null)
      try {
        const result = await getRawMaterialStock({
          page,
          page_size: RAW_MATERIALS_PAGE_SIZE,
          sort: sort || undefined,
          low_only: lowOnly || undefined,
          material_type: materialType || undefined,
        })
        setRawMaterials(result.items)
        setRmTotal(result.total)
        setRmTotalPages(result.total_pages)
      } catch (err) {
        setRmError(getApiErrorMessage(err))
      } finally {
        setRmLoading(false)
      }
    },
    [],
  )

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

  const loadPendingRequests = useCallback(async () => {
    setPendingLoading(true)
    setPendingError(null)
    try {
      const result = await listAdjustmentRequests({ status: 'pending', page_size: 50 })
      setPendingRequests(result.items)
    } catch (err) {
      setPendingError(getApiErrorMessage(err))
    } finally {
      setPendingLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMovements(movementsPage, movementsSort)
  }, [loadMovements, movementsPage, movementsSort])

  useEffect(() => {
    loadFinishedGoods(fgPage, fgSort, fgLowOnly)
  }, [loadFinishedGoods, fgPage, fgSort, fgLowOnly])

  useEffect(() => {
    loadRawMaterials(rmPage, rmSort, rmLowOnly, rmMaterialType)
  }, [loadRawMaterials, rmPage, rmSort, rmLowOnly, rmMaterialType])

  useEffect(() => {
    if (isAdminUser) loadPendingRequests()
  }, [isAdminUser, loadPendingRequests])

  async function handleApprove(requestId: number) {
    setDecisionBusyId(requestId)
    setPendingError(null)
    try {
      await approveAdjustmentRequest(requestId)
      await loadPendingRequests()
      loadRawMaterials(rmPage, rmSort, rmLowOnly, rmMaterialType)
      loadFinishedGoods(fgPage, fgSort, fgLowOnly)
    } catch (err) {
      setPendingError(getApiErrorMessage(err))
    } finally {
      setDecisionBusyId(null)
    }
  }

  async function handleReject(requestId: number) {
    const reason = rejectReasonById[requestId]
    if (!reason || !reason.trim()) {
      setPendingError('Enter a reason to reject this adjustment request.')
      return
    }
    setDecisionBusyId(requestId)
    setPendingError(null)
    try {
      await rejectAdjustmentRequest(requestId, reason)
      await loadPendingRequests()
      setRejectReasonById((prev) => ({ ...prev, [requestId]: '' }))
    } catch (err) {
      setPendingError(getApiErrorMessage(err))
    } finally {
      setDecisionBusyId(null)
    }
  }

  function toggleFgSort(field: string) {
    setFgSort((current) => {
      if (current === field) return `-${field}`
      if (current === `-${field}`) return ''
      return field
    })
    setFgPage(1)
  }

  function toggleMovementsSort(field: string) {
    setMovementsSort((current) => {
      if (current === field) return `-${field}`
      if (current === `-${field}`) return ''
      return field
    })
    setMovementsPage(1)
  }

  function toggleRmSort(field: string) {
    setRmSort((current) => {
      if (current === field) return `-${field}`
      if (current === `-${field}`) return ''
      return field
    })
    setRmPage(1)
  }

  return (
    <AppLayout>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels, low-stock alerts, and movement history"
        actions={canAdjust ? <Button onClick={() => navigate('/inventory/adjust')}>Adjust stock</Button> : undefined}
      />

      <div className="flex flex-col gap-6">
        {isAdminUser && (pendingLoading || pendingRequests.length > 0) && (
          <GlassCard className="overflow-hidden">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-medium text-white">Pending stock adjustment approvals</h2>
              <p className="mt-1 text-xs text-white/40">
                These adjustments are above the approval threshold and have not been applied yet.
              </p>
            </div>
            <Alert variant="error">{pendingError}</Alert>
            {pendingLoading ? (
              <div className="flex justify-center py-12">
                <Spinner size={24} className="text-gold-300" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                      <th className="px-6 py-4 font-medium">Item</th>
                      <th className="px-6 py-4 font-medium">Quantity</th>
                      <th className="px-6 py-4 font-medium">Reason</th>
                      <th className="px-6 py-4 font-medium">Requested</th>
                      <th className="px-6 py-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((r) => (
                      <tr key={r.id} className="border-b border-white/5 last:border-0 align-top">
                        <td className="px-6 py-4 text-white">
                          <Link
                            to={`/${r.item_type === 'product' ? 'products' : 'raw-materials'}/${r.item_id}`}
                            className="text-gold-300 hover:text-gold-200"
                          >
                            {r.item_type} #{r.item_id}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-white/60">
                          {r.quantity} ({r.movement_type})
                        </td>
                        <td className="px-6 py-4 text-white/60">{r.reason}</td>
                        <td className="px-6 py-4 text-white/40">{formatDateTime(r.requested_at)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-end gap-2">
                            <div className="w-40">
                              <TextField
                                label="Rejection reason"
                                value={rejectReasonById[r.id] ?? ''}
                                onChange={(e) => setRejectReasonById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              />
                            </div>
                            <Button
                              size="sm"
                              isLoading={decisionBusyId === r.id}
                              onClick={() => handleApprove(r.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              isLoading={decisionBusyId === r.id}
                              onClick={() => handleReject(r.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        )}

        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-medium text-white">Finished goods</h2>
              <p className="mt-1 text-xs text-white/40">
                On-hand, reserved, and available stock for every active product.
              </p>
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
              title={fgLowOnly ? 'Nothing is low' : 'No finished goods'}
              message={fgLowOnly ? 'Every product is above its reorder point.' : undefined}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                      <SortableHeader label="Product" field="name" sort={fgSort} onSort={toggleFgSort} />
                      <SortableHeader
                        label="On hand"
                        field="quantity_on_hand"
                        sort={fgSort}
                        onSort={toggleFgSort}
                      />
                      <th className="px-6 py-4 font-medium">Reserved</th>
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
                      <tr key={item.product_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
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
        </GlassCard>

        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-medium text-white">Raw materials</h2>
              <p className="mt-1 text-xs text-white/40">
                On-hand, reserved, and available stock for every active raw material -- filter by type to view
                packaging stock independently from ordinary raw materials.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-44">
                <SelectField
                  label="Material type"
                  value={rmMaterialType}
                  onChange={(e) => {
                    setRmMaterialType(e.target.value as '' | RawMaterialType)
                    setRmPage(1)
                  }}
                >
                  <option value="">All material types</option>
                  <option value="raw_material">Raw material</option>
                  <option value="packaging">Packaging</option>
                  <option value="consumable">Consumable</option>
                </SelectField>
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
          </div>
          <Alert variant="error">{rmError}</Alert>
          {rmLoading ? (
            <div className="flex justify-center py-16">
              <Spinner size={24} className="text-gold-300" />
            </div>
          ) : rawMaterials.length === 0 ? (
            <EmptyState
              title={rmLowOnly ? 'Nothing is low' : 'No raw materials'}
              message={rmLowOnly ? 'Every material is above its reorder point.' : undefined}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                      <SortableHeader label="Material" field="name" sort={rmSort} onSort={toggleRmSort} />
                      <th className="px-6 py-4 font-medium">Type</th>
                      <SortableHeader
                        label="On hand"
                        field="quantity_on_hand"
                        sort={rmSort}
                        onSort={toggleRmSort}
                      />
                      <th className="px-6 py-4 font-medium">Reserved</th>
                      <th className="px-6 py-4 font-medium">Available</th>
                      <SortableHeader
                        label="Reorder point"
                        field="reorder_point"
                        sort={rmSort}
                        onSort={toggleRmSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {rawMaterials.map((item) => (
                      <tr key={item.raw_material_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                        <td className="px-6 py-4">
                          <Link
                            to={`/raw-materials/${item.raw_material_id}`}
                            className="font-medium text-gold-300 hover:text-gold-200"
                          >
                            {item.code} — {item.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-white/60">{MATERIAL_TYPE_LABEL[item.material_type]}</td>
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
                      <th className="px-6 py-4 font-medium">Reference</th>
                      <th className="px-6 py-4 font-medium">Batch/Lot</th>
                      <th className="px-6 py-4 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => {
                      const refLink = referenceLink(m.reference_type, m.reference_id)
                      return (
                        <tr key={m.id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4 text-white/60">{formatDateTime(m.created_at)}</td>
                          <td className="px-6 py-4 text-white">
                            {m.item_type} #{m.item_id}
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={m.movement_type === 'issue' ? 'danger' : 'success'}>{m.movement_type}</Badge>
                          </td>
                          <td className="px-6 py-4 text-white/60">{m.quantity}</td>
                          <td className="px-6 py-4 text-white/60">
                            {m.reference_type ? (
                              refLink ? (
                                <Link to={refLink} className="text-gold-300 hover:text-gold-200">
                                  {m.reference_type} #{m.reference_id}
                                </Link>
                              ) : (
                                <span>
                                  {m.reference_type} #{m.reference_id}
                                </span>
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-6 py-4 text-white/60">{m.batch_number ?? '—'}</td>
                          <td className="px-6 py-4 text-white/40">{m.notes ?? '—'}</td>
                        </tr>
                      )
                    })}
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
