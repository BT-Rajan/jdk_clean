import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Button, EmptyState, GlassCard, PageHeader, Spinner } from '@/components/ui'
import { StatsWidget } from '@/components/dashboard/DashboardWidgets'
import { getDashboardStats } from '@/api/dashboard'
import { listNotifications } from '@/api/notifications'
import { getLowStock, getFinishedGoodsStock } from '@/api/inventory'
import { useAuth } from '@/hooks/useAuth'
import { canAdjustInventory } from '@/lib/roles'
import type { DashboardStatsResponse } from '@/types/dashboard'
import type { Notification, NotificationSeverity } from '@/types/notification'
import type { FinishedGoodStockItem, LowStockItem } from '@/types/inventory'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'

// Same severity styling the main Dashboard's Needs Attention section (and
// PurchasingHomePage's own copy of it) use -- kept in sync deliberately so
// an item reads the same way everywhere, not a second notification design.
const severityColor: Record<NotificationSeverity, string> = {
  high: 'bg-red-500/10 border-red-500/30 text-red-300',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  low: 'bg-white/5 border-white/10 text-white/50',
}
const severityLabel: Record<NotificationSeverity, string> = {
  high: 'Needs attention',
  medium: 'Follow up',
  low: 'FYI',
}
const severityRank: Record<NotificationSeverity, number> = { high: 0, medium: 1, low: 2 }
const MAX_NEEDS_ATTENTION = 6
const MAX_RAW_MATERIALS = 5
const MAX_FINISHED_GOODS = 5

// Warehouse's own slice of the same live notification feed the header
// bell and the main Dashboard already show (GET /api/notifications) --
// not a separate to-do system. See notification_service.py: low_stock,
// production_delayed, and feasibility_bom_missing are each specifically
// scoped to the "warehouse" department there, alongside procurement for
// low_stock -- not every notification type, just the ones this
// department is actually meant to see.
function isWarehouseNotification(n: Notification): boolean {
  return n.type === 'low_stock' || n.type === 'production_delayed' || n.type === 'feasibility_bom_missing'
}

export function WarehouseHomePage() {
  const { user } = useAuth()
  const canAdjust = canAdjustInventory(user?.role)

  const [stats, setStats] = useState<DashboardStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(true)

  const [lowRawMaterials, setLowRawMaterials] = useState<LowStockItem[]>([])
  const [lowRawMaterialsLoading, setLowRawMaterialsLoading] = useState(true)

  const [lowFinishedGoods, setLowFinishedGoods] = useState<FinishedGoodStockItem[]>([])
  const [lowFinishedGoodsTotal, setLowFinishedGoodsTotal] = useState(0)
  const [lowFinishedGoodsLoading, setLowFinishedGoodsLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((err) => setStatsError(getApiErrorMessage(err)))
      .finally(() => setStatsLoading(false))
    listNotifications()
      .then((res) => setNotifications(res.items))
      .catch(() => setNotifications([]))
      .finally(() => setNotifLoading(false))
    getLowStock()
      .then(setLowRawMaterials)
      .catch(() => setLowRawMaterials([]))
      .finally(() => setLowRawMaterialsLoading(false))
    getFinishedGoodsStock({ page: 1, page_size: MAX_FINISHED_GOODS, low_only: true })
      .then((result) => {
        setLowFinishedGoods(result.items)
        setLowFinishedGoodsTotal(result.total)
      })
      .catch(() => {
        setLowFinishedGoods([])
        setLowFinishedGoodsTotal(0)
      })
      .finally(() => setLowFinishedGoodsLoading(false))
  }, [])

  const warehouseNotifications = useMemo(
    () =>
      notifications
        .filter(isWarehouseNotification)
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.created_at < b.created_at ? 1 : -1))
        .slice(0, MAX_NEEDS_ATTENTION),
    [notifications],
  )

  const topRawMaterials = useMemo(
    () =>
      [...lowRawMaterials]
        .sort((a, b) => b.reorder_point - b.quantity_on_hand - (a.reorder_point - a.quantity_on_hand))
        .slice(0, MAX_RAW_MATERIALS),
    [lowRawMaterials],
  )

  return (
    <AppLayout>
      <PageHeader
        title="Warehouse"
        subtitle="Stock on hand across raw materials and finished goods — what's low, and what it's worth right now."
      />

      <Alert variant="error">{statsError}</Alert>

      {!statsLoading && stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsWidget title="Inventory value" value={formatCurrency(stats.stats.inventory_value?.value)} to="/inventory" />
          <StatsWidget title="Items in stock" value={stats.stats.inventory_items?.value ?? '—'} to="/inventory" />
          <StatsWidget title="Raw materials low" value={stats.stats.low_stock_count?.value ?? '—'} to="/raw-materials" />
          <StatsWidget
            title="Finished goods low"
            value={lowFinishedGoodsLoading ? '—' : lowFinishedGoodsTotal}
            to="/inventory"
          />
        </div>
      )}
      {statsLoading && (
        <div className="mb-8 flex justify-center py-8">
          <Spinner size={24} className="text-gold-300" />
        </div>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2 flex flex-col gap-8">
          <div>
            <h2 className="mb-4 font-display text-lg font-medium text-white">Needs attention</h2>
            {notifLoading ? (
              <GlassCard className="p-6 text-sm text-white/40">Loading…</GlassCard>
            ) : warehouseNotifications.length === 0 ? (
              <GlassCard className="p-6 text-sm text-white/50">Nothing in the warehouse needs action right now.</GlassCard>
            ) : (
              <div className="space-y-3">
                {warehouseNotifications.map((n) => (
                  <Link
                    key={n.id}
                    to={n.link}
                    className="block rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:border-white/20 hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-white">{n.title}</p>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${severityColor[n.severity]}`}>
                        {severityLabel[n.severity]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/60">{n.message}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">Raw materials low on stock</h2>
              <Link to="/raw-materials" className="text-sm text-gold-300 hover:text-gold-200">
                All raw materials →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {lowRawMaterialsLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : topRawMaterials.length === 0 ? (
                <EmptyState title="Nothing low" message="Every raw material is currently above its reorder point." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Material</th>
                        <th className="px-6 py-4 font-medium">On hand</th>
                        <th className="px-6 py-4 font-medium">Reorder point</th>
                        <th className="px-6 py-4 font-medium">Short by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRawMaterials.map((item) => (
                        <tr key={item.raw_material_id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to={`/raw-materials/${item.raw_material_id}`} className="font-medium text-gold-300 hover:text-gold-200">
                              {item.code} — {item.name}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">{item.quantity_on_hand.toLocaleString()}</td>
                          <td className="px-6 py-4 text-white/60">{item.reorder_point.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <Badge tone="danger">{Math.max(0, item.reorder_point - item.quantity_on_hand).toLocaleString()}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {lowRawMaterials.length > topRawMaterials.length && (
                <p className="px-6 pb-4 text-xs text-white/40">
                  +{lowRawMaterials.length - topRawMaterials.length} more low raw material
                  {lowRawMaterials.length - topRawMaterials.length === 1 ? '' : 's'} not shown here.
                </p>
              )}
            </GlassCard>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-medium text-white">Finished goods low on stock</h2>
              <Link to="/inventory" className="text-sm text-gold-300 hover:text-gold-200">
                All stock levels →
              </Link>
            </div>
            <GlassCard className="min-w-0 overflow-hidden">
              {lowFinishedGoodsLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : lowFinishedGoods.length === 0 ? (
                <EmptyState title="Nothing low" message="Every finished good is currently above its reorder point." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Product</th>
                        <th className="px-6 py-4 font-medium">On hand</th>
                        <th className="px-6 py-4 font-medium">Reorder point</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowFinishedGoods.map((item) => (
                        <tr key={item.product_id} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-4">
                            <Link to="/inventory" className="font-medium text-gold-300 hover:text-gold-200">
                              {item.code} — {item.name}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-white/60">
                            {item.quantity_on_hand.toLocaleString()} {item.unit}
                          </td>
                          <td className="px-6 py-4 text-white/60">{item.reorder_point.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <Badge tone="danger">Low</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {lowFinishedGoodsTotal > lowFinishedGoods.length && (
                <p className="px-6 pb-4 text-xs text-white/40">
                  +{lowFinishedGoodsTotal - lowFinishedGoods.length} more low finished good
                  {lowFinishedGoodsTotal - lowFinishedGoods.length === 1 ? '' : 's'} not shown here.
                </p>
              )}
            </GlassCard>
          </div>
        </div>

        <div>
          <h2 className="mb-4 font-display text-lg font-medium text-white">Go to</h2>
          <div className="flex flex-col gap-2">
            {canAdjust && (
              <Link to="/inventory/adjust">
                <Button variant="ghost" className="w-full justify-start">Adjust stock</Button>
              </Link>
            )}
            <Link to="/products">
              <Button variant="ghost" className="w-full justify-start">Products</Button>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
