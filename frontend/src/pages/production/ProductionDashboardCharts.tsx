import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, StatusBadge } from '@/components/ui'
import { ChartCard, DrilldownPanel } from '@/components/dashboard/DashboardCharts'
import type { DrilldownColumn } from '@/components/dashboard/DashboardCharts'
import { getProductionDrilldown, getProductionReport } from '@/api/reports'
import type {
  ProductionDrilldownBatch,
  ProductionReport,
  ProductionReportMonthly,
  ProductionReportStatus,
} from '@/types/reports'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate } from '@/lib/dateFormat'
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

// Same colors as the Production report's status bars (which mirror the
// StatusBadge tones), so a bar matches its badge everywhere.
const STATUS_COLORS: Record<string, string> = {
  planned: '#9aa0ae',
  in_progress: '#d4af6a',
  completed: '#34d399',
  cancelled: '#f87171',
}

interface DrilldownFilter {
  label: string
  year?: number
  month?: number
  status?: string
}

const BATCH_COLUMNS: DrilldownColumn<ProductionDrilldownBatch>[] = [
  {
    header: 'Batch',
    cell: (b) => (
      <Link to={`/production/${b.id}`} className="font-medium text-gold-300 hover:text-gold-200">
        {b.batch_number}
      </Link>
    ),
  },
  { header: 'Product', cell: (b) => <span className="text-white">{b.product_name ?? '—'}</span> },
  { header: 'Scheduled start', cell: (b) => <span className="text-white/60">{formatDate(b.scheduled_start)}</span> },
  { header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
  {
    header: 'Quantity',
    cell: (b) => <span className="text-white/60">{b.status === 'completed' ? b.produced_quantity : b.planned_quantity}</span>,
  },
]

/**
 * The two graphs on the Production dashboard -- output & batches by month,
 * and batches by status. Clicking a bar opens the batches behind it right
 * below the graphs (same /api/reports/production/drilldown the Production
 * report uses).
 */
export function ProductionDashboardCharts() {
  const [report, setReport] = useState<ProductionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<DrilldownFilter | null>(null)
  const [batches, setBatches] = useState<ProductionDrilldownBatch[] | null>(null)
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [batchesError, setBatchesError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    getProductionReport({ months: REPORT_MONTHS })
      .then(setReport)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  function openDrilldown(next: DrilldownFilter) {
    const thisRequest = ++requestId.current
    setFilter(next)
    setBatches(null)
    setBatchesError(null)
    setBatchesLoading(true)
    getProductionDrilldown({ year: next.year, month: next.month, status: next.status })
      .then((res) => {
        if (thisRequest === requestId.current) setBatches(res.items)
      })
      .catch((err) => {
        if (thisRequest === requestId.current) setBatchesError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (thisRequest === requestId.current) setBatchesLoading(false)
      })
  }

  function clearDrilldown() {
    requestId.current++
    setFilter(null)
    setBatches(null)
  }

  const monthly = report?.monthly ?? []
  const byStatus = report?.by_status ?? []

  return (
    <div className="mb-8 flex flex-col gap-6">
      <Alert variant="error">{error}</Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Output & batches by month"
          hint={`Last ${REPORT_MONTHS} months — click a bar to see that month's batches.`}
          loading={loading}
          isEmpty={monthly.length === 0}
          emptyTitle="No production yet"
          emptyMessage="Output will appear here once batches are scheduled."
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="label" tick={AXIS_TICK} />
              <YAxis yAxisId="quantity" tick={AXIS_TICK} width={60} />
              <YAxis yAxisId="batches" orientation="right" tick={AXIS_TICK} allowDecimals={false} />
              <Tooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(value: ValueType | undefined, name: NameType | undefined) =>
                  name === 'produced_quantity' ? [toNumber(value), 'Produced'] : [toNumber(value), 'Batches']
                }
              />
              <Bar
                yAxisId="quantity"
                dataKey="produced_quantity"
                fill="#d4af6a"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={onBarClick<ProductionReportMonthly>((row) =>
                  openDrilldown({ year: row.year, month: row.month, label: `Batches — ${row.label}` }),
                )}
              />
              <Line yAxisId="batches" dataKey="batch_count" name="batch_count" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Batches by status"
          hint="Click a bar to see those batches."
          loading={loading}
          isEmpty={byStatus.length === 0}
          emptyTitle="No batches yet"
          emptyMessage="Batches will be grouped by status here."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={byStatus} margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="status"
                tick={AXIS_TICK}
                tickFormatter={(v: string) => v.replace(/_/g, ' ')}
                width={110}
              />
              <Tooltip
                cursor={TOOLTIP_CURSOR}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(value: ValueType | undefined, _name: NameType | undefined, item: { payload?: ProductionReportStatus }) => [
                  `${toNumber(value)} batches · ${item.payload?.planned_quantity ?? 0} planned`,
                  (item.payload?.status ?? '').replace(/_/g, ' '),
                ]}
              />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={onBarClick<ProductionReportStatus>((row) =>
                  openDrilldown({ status: row.status, label: `${row.status.replace(/_/g, ' ')} batches` }),
                )}
              >
                {byStatus.map((s) => (
                  <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#9aa0ae'} />
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
          items={batches}
          loading={batchesLoading}
          error={batchesError}
          columns={BATCH_COLUMNS}
          rowKey={(b) => b.id}
          emptyTitle="No batches found"
          emptyMessage="Nothing matches this selection."
          onClear={clearDrilldown}
        />
      )}
    </div>
  )
}
