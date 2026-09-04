import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AppLayout } from '@/components/layout/AppLayout'
import { StatsWidget } from '@/components/dashboard/DashboardWidgets'
import { Alert, Badge, Button, EmptyState, GlassCard, PageHeader, SelectField, Spinner } from '@/components/ui'
import { getInventoryDrilldown, getInventoryReport } from '@/api/reports'
import type {
  InventoryDrilldownMovement,
  InventoryReport,
  InventoryReportMonthly,
  InventoryReportMovementType,
  InventoryReportTopItem,
} from '@/types/reports'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatCurrency } from '@/lib/currency'
import { formatDateTime } from '@/lib/dateFormat'
import {
  AXIS_TICK,
  GRID_STROKE,
  onBarClick,
  toNumber,
  TOOLTIP_CURSOR,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from './chartHelpers'
import type { ValueType } from './chartHelpers'

// Not in components/ui/Badge.tsx's STATUS_TONES (those are entity
// statuses, not movement types) -- own small palette: green for stock
// increasing, violet for normal outgoing use, gold for production,
// grey for a manual correction, red for a supplier-quality return.
const MOVEMENT_COLORS: Record<string, string> = {
  receipt: '#34d399',
  issue: '#a78bfa',
  adjustment: '#9aa0ae',
  production_in: '#d4af6a',
  production_out: '#e4c37e',
  return: '#34d399',
  return_to_supplier: '#f87171',
}

interface DrilldownFilter {
  year?: number
  month?: number
  movementType?: string
  itemType?: string
  itemId?: number
  label: string
}

export function InventoryReportPage() {
  const [months, setMonths] = useState(12)
  const [report, setReport] = useState<InventoryReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [drilldown, setDrilldown] = useState<InventoryDrilldownMovement[] | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)
  const [drilldownError, setDrilldownError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getInventoryReport(months)
      .then(setReport)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [months])

  useEffect(load, [load])

  useEffect(() => {
    if (!filter) {
      setDrilldown(null)
      return
    }
    setDrilldownLoading(true)
    setDrilldownError(null)
    getInventoryDrilldown({
      year: filter.year,
      month: filter.month,
      movement_type: filter.movementType,
      item_type: filter.itemType,
      item_id: filter.itemId,
    })
      .then((res) => setDrilldown(res.items))
      .catch((err) => setDrilldownError(getApiErrorMessage(err)))
      .finally(() => setDrilldownLoading(false))
  }, [filter])

  const totalMovements = useMemo(
    () => report?.by_movement_type.reduce((sum, t) => sum + t.count, 0) ?? 0,
    [report],
  )

  return (
    <AppLayout>
      <PageHeader
        title="Inventory report"
        subtitle="Stock levels, movement history, and reorder trends. Click any chart to drill into the movements behind it."
        actions={
          <div className="flex items-end gap-3">
            <div className="w-44">
              <SelectField label="Range" value={String(months)} onChange={(e) => setMonths(Number(e.target.value))}>
                <option value="6">Last 6 months</option>
                <option value="12">Last 12 months</option>
                <option value="24">Last 24 months</option>
              </SelectField>
            </div>
            <Button variant="ghost" onClick={load} isLoading={loading}>
              Refresh
            </Button>
          </div>
        }
      />

      <Alert variant="error">{error}</Alert>

      {loading && !report ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} className="text-gold-300" />
        </div>
      ) : report ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsWidget title="Raw material value" value={formatCurrency(report.raw_material_value)} />
            <StatsWidget title="Finished goods value" value={formatCurrency(report.finished_goods_value)} />
            <StatsWidget title="Low stock items" value={report.low_stock_count} />
            <StatsWidget title="Movements in range" value={totalMovements} />
          </div>

          <GlassCard className="mb-6 p-6">
            <h2 className="mb-1 font-display text-lg font-medium text-white">Movement by month</h2>
            <p className="mb-4 text-xs text-white/40">Click a bar to see the movements behind that month.</p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} width={60} />
                  <Tooltip
                    cursor={TOOLTIP_CURSOR}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(value: ValueType | undefined) => toNumber(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} />
                  <Bar
                    dataKey="inbound"
                    name="Inbound"
                    fill="#34d399"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={onBarClick<InventoryReportMonthly>((row) =>
                      setFilter({ year: row.year, month: row.month, label: row.label }),
                    )}
                  />
                  <Bar
                    dataKey="outbound"
                    name="Outbound"
                    fill="#a78bfa"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={onBarClick<InventoryReportMonthly>((row) =>
                      setFilter({ year: row.year, month: row.month, label: row.label }),
                    )}
                  />
                  <Bar
                    dataKey="production"
                    name="Production"
                    fill="#d4af6a"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={onBarClick<InventoryReportMonthly>((row) =>
                      setFilter({ year: row.year, month: row.month, label: row.label }),
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GlassCard className="p-6">
              <h2 className="mb-1 font-display text-lg font-medium text-white">Movements by type</h2>
              <p className="mb-4 text-xs text-white/40">Click a bar to see those movements.</p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={report.by_movement_type} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} />
                    <YAxis
                      type="category"
                      dataKey="movement_type"
                      tick={AXIS_TICK}
                      tickFormatter={(v: string) => v.replace(/_/g, ' ')}
                      width={110}
                    />
                    <Tooltip
                      cursor={TOOLTIP_CURSOR}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(
                        value: ValueType | undefined,
                        _name,
                        item: { payload?: InventoryReportMovementType },
                      ) => [
                        `${toNumber(value)} units · ${item.payload?.count ?? 0} events`,
                        (item.payload?.movement_type ?? '').replace(/_/g, ' '),
                      ]}
                    />
                    <Bar
                      dataKey="quantity"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={onBarClick<InventoryReportMovementType>((row) =>
                        setFilter({ movementType: row.movement_type, label: row.movement_type.replace(/_/g, ' ') }),
                      )}
                    >
                      {report.by_movement_type.map((t) => (
                        <Cell key={t.movement_type} fill={MOVEMENT_COLORS[t.movement_type] ?? '#9aa0ae'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h2 className="mb-1 font-display text-lg font-medium text-white">Most active items</h2>
              <p className="mb-4 text-xs text-white/40">Click a bar to see its movements.</p>
              {report.top_items.length === 0 ? (
                <EmptyState title="No movement yet" message="Nothing to show for this range." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={report.top_items} margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} />
                      <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={140} />
                      <Tooltip
                        cursor={TOOLTIP_CURSOR}
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(
                          value: ValueType | undefined,
                          _name,
                          item: { payload?: InventoryReportTopItem },
                        ) => [`${toNumber(value)} units`, item.payload?.code ?? '']}
                      />
                      <Bar
                        dataKey="quantity"
                        fill="#d4af6a"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={onBarClick<InventoryReportTopItem>((row) =>
                          setFilter({
                            itemType: row.item_type,
                            itemId: row.item_id,
                            label: `${row.code} — ${row.name}`,
                          }),
                        )}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>
          </div>

          {filter && (
            <GlassCard className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
                <div>
                  <h2 className="font-display text-lg font-medium text-white capitalize">Movements — {filter.label}</h2>
                  <p className="mt-1 text-xs text-white/40">Drilled down from the charts above.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>
                  Clear filter
                </Button>
              </div>
              <Alert variant="error">{drilldownError}</Alert>
              {drilldownLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={24} className="text-gold-300" />
                </div>
              ) : !drilldown || drilldown.length === 0 ? (
                <EmptyState title="No movements found" message="Nothing matches this drill-down." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                        <th className="px-6 py-4 font-medium">Date</th>
                        <th className="px-6 py-4 font-medium">Item</th>
                        <th className="px-6 py-4 font-medium">Type</th>
                        <th className="px-6 py-4 font-medium">Quantity</th>
                        <th className="px-6 py-4 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldown.map((m) => (
                        <tr key={m.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                          <td className="px-6 py-4 text-white/60">{formatDateTime(m.created_at)}</td>
                          <td className="px-6 py-4">
                            {m.item_route ? (
                              <Link to={m.item_route} className="font-medium text-gold-300 hover:text-gold-200">
                                {m.item_name}
                              </Link>
                            ) : (
                              <span className="text-white">{m.item_name ?? '—'}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <Badge tone={m.movement_type === 'issue' || m.movement_type === 'return_to_supplier' ? 'danger' : 'success'}>
                              {m.movement_type}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-white/60">{m.quantity}</td>
                          <td className="px-6 py-4 text-white/40">{m.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          )}
        </>
      ) : null}
    </AppLayout>
  )
}
