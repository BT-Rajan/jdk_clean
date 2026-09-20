import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, Badge } from '@/components/ui'
import { ChartCard, DrilldownPanel } from '@/components/dashboard/DashboardCharts'
import type { DrilldownColumn } from '@/components/dashboard/DashboardCharts'
import { getInventoryDrilldown, getInventoryReport } from '@/api/reports'
import type {
  InventoryDrilldownMovement,
  InventoryReport,
  InventoryReportMonthly,
  InventoryReportMovementType,
} from '@/types/reports'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/dateFormat'
import {
  AXIS_TICK,
  GRID_STROKE,
  onBarClick,
  toNumber,
  TOOLTIP_CURSOR,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from '@/pages/reports/chartHelpers'
import type { NameType, ValueType } from '@/pages/reports/chartHelpers'

const REPORT_MONTHS = 6

// Same palette as the Inventory report: green for stock increasing, violet
// for normal outgoing use, gold for production, grey for a manual
// correction, red for a supplier-quality return.
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
  label: string
  year?: number
  month?: number
  movementType?: string
}

const MOVEMENT_COLUMNS: DrilldownColumn<InventoryDrilldownMovement>[] = [
  { header: 'Date', cell: (m) => <span className="text-white/60">{formatDateTime(m.created_at)}</span> },
  {
    header: 'Item',
    cell: (m) =>
      m.item_route ? (
        <Link to={m.item_route} className="font-medium text-gold-300 hover:text-gold-200">
          {m.item_name}
        </Link>
      ) : (
        <span className="text-white">{m.item_name ?? '—'}</span>
      ),
  },
  {
    header: 'Type',
    cell: (m) => (
      <Badge tone={m.movement_type === 'issue' || m.movement_type === 'return_to_supplier' ? 'danger' : 'success'}>
        {m.movement_type}
      </Badge>
    ),
  },
  { header: 'Quantity', cell: (m) => <span className="text-white/60">{m.quantity}</span> },
  { header: 'Notes', cell: (m) => <span className="text-white/40">{m.notes ?? '—'}</span> },
]

/**
 * The two graphs on the Warehouse dashboard -- stock movement by month
 * (inbound / outbound / production) and movements by type. Clicking a bar
 * opens the movements behind it right below the graphs (same
 * /api/reports/inventory/drilldown the Inventory report uses).
 */
export function WarehouseDashboardCharts() {
  const [report, setReport] = useState<InventoryReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [movements, setMovements] = useState<InventoryDrilldownMovement[] | null>(null)
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementsError, setMovementsError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    getInventoryReport({ months: REPORT_MONTHS })
      .then(setReport)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  function openDrilldown(next: DrilldownFilter) {
    const thisRequest = ++requestId.current
    setFilter(next)
    setMovements(null)
    setMovementsError(null)
    setMovementsLoading(true)
    getInventoryDrilldown({ year: next.year, month: next.month, movement_type: next.movementType })
      .then((res) => {
        if (thisRequest === requestId.current) setMovements(res.items)
      })
      .catch((err) => {
        if (thisRequest === requestId.current) setMovementsError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (thisRequest === requestId.current) setMovementsLoading(false)
      })
  }

  function clearDrilldown() {
    requestId.current++
    setFilter(null)
    setMovements(null)
  }

  const monthly = report?.monthly ?? []
  const byType = report?.by_movement_type ?? []

  function onMonthClick(row: InventoryReportMonthly) {
    openDrilldown({ year: row.year, month: row.month, label: `Movements — ${row.label}` })
  }

  return (
    <div className="mb-8 flex flex-col gap-6">
      <Alert variant="error">{error}</Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Stock movement by month"
          hint={`Last ${REPORT_MONTHS} months — click a bar to see that month's movements.`}
          loading={loading}
          isEmpty={monthly.length === 0}
          emptyTitle="No movement yet"
          emptyMessage="Stock in, out and produced will appear here."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
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
              <Bar dataKey="inbound" name="Inbound" fill="#34d399" radius={[4, 4, 0, 0]} cursor="pointer" onClick={onBarClick<InventoryReportMonthly>(onMonthClick)} />
              <Bar dataKey="outbound" name="Outbound" fill="#a78bfa" radius={[4, 4, 0, 0]} cursor="pointer" onClick={onBarClick<InventoryReportMonthly>(onMonthClick)} />
              <Bar dataKey="production" name="Production" fill="#d4af6a" radius={[4, 4, 0, 0]} cursor="pointer" onClick={onBarClick<InventoryReportMonthly>(onMonthClick)} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Movements by type"
          hint="Click a bar to see those movements."
          loading={loading}
          isEmpty={byType.length === 0}
          emptyTitle="No movement yet"
          emptyMessage="Movements will be grouped by type here."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={byType} margin={{ left: 8 }}>
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
                formatter={(value: ValueType | undefined, _name: NameType | undefined, item: { payload?: InventoryReportMovementType }) => [
                  `${toNumber(value)} units · ${item.payload?.count ?? 0} events`,
                  (item.payload?.movement_type ?? '').replace(/_/g, ' '),
                ]}
              />
              <Bar
                dataKey="quantity"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={onBarClick<InventoryReportMovementType>((row) =>
                  openDrilldown({ movementType: row.movement_type, label: `${row.movement_type.replace(/_/g, ' ')} movements` }),
                )}
              >
                {byType.map((t) => (
                  <Cell key={t.movement_type} fill={MOVEMENT_COLORS[t.movement_type] ?? '#9aa0ae'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {filter && (
        <DrilldownPanel
          title={filter.label}
          subtitle="Drilled down from the graphs above."
          items={movements}
          loading={movementsLoading}
          error={movementsError}
          columns={MOVEMENT_COLUMNS}
          rowKey={(m) => m.id}
          emptyTitle="No movements found"
          emptyMessage="Nothing matches this selection."
          onClear={clearDrilldown}
        />
      )}
    </div>
  )
}
