import { useRef } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { formatCurrency } from '@/lib/currency'
import {
  AXIS_TICK,
  compact,
  GRID_STROKE,
  onBarClick,
  REVENUE_COLOR,
  toNumber,
  TOOLTIP_CURSOR,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  truncate,
} from './chartHelpers'
import type { ValueType } from './chartHelpers'
import type { RevenueRow } from './revenueRows'
import { BarEndLabel, NoWrapYTick } from './SalesReportPanels'

/**
 * Horizontal revenue bars, shared by Top customers and Top products (on the
 * Sales report and the Sales dashboard) so they read identically.
 *
 * Pass `height` for a fixed-size chart, or omit it to fill the parent --
 * the parent then needs a definite height. Bars are clickable only when
 * `onSelect` is given -- anywhere along a bar's row, not just on the thin
 * bar itself. `selected` marks the row whose drill-down is open (the rest
 * are dimmed).
 */
export function RevenueBars<T>({
  rows,
  height,
  onSelect,
  selected,
}: {
  rows: RevenueRow<T>[]
  height?: number
  onSelect?: (row: T) => void
  selected?: (row: T) => boolean
}) {
  const narrow = useMediaQuery('(max-width: 639px)')
  const anySelected = selected ? rows.some((r) => selected(r.source)) : false

  // A click on a bar reaches both the bar's and the chart's handler; only
  // the first one should act.
  const lastFire = useRef<{ row: T; at: number } | null>(null)
  const fire = (row: T) => {
    const now = Date.now()
    if (lastFire.current && lastFire.current.row === row && now - lastFire.current.at < 400) return
    lastFire.current = { row, at: now }
    onSelect?.(row)
  }
  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 0)
  return (
    <div className="w-full" style={{ height: height ?? '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 0, right: 44, left: 0, bottom: 0 }}
          style={onSelect ? { cursor: 'pointer' } : undefined}
          onClick={
            onSelect
              ? (state) => {
                  // No active row (e.g. a touch tap) -- the bar's own
                  // handler covers that; Number(null) would read as row 0.
                  const active = state?.activeTooltipIndex
                  if (active === null || active === undefined) return
                  const i = Number(active)
                  if (Number.isInteger(i) && rows[i]) fire(rows[i].source)
                }
              : undefined
          }
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            tickCount={4}
            tickFormatter={(v: number) => compact(v)}
            domain={[0, maxRevenue > 0 ? 'auto' : 1]}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={narrow ? 104 : 136}
            interval={0}
            tick={<NoWrapYTick format={(v) => truncate(v, narrow ? 12 : 18)} />}
          />
          <Tooltip
            cursor={TOOLTIP_CURSOR}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            labelFormatter={(_label: unknown, payload: readonly { payload?: RevenueRow<T> }[]) =>
              payload?.[0]?.payload?.title ?? ''
            }
            formatter={(value: ValueType | undefined) => [formatCurrency(toNumber(value)), 'Revenue']}
          />
          <Bar
            dataKey="revenue"
            fill={REVENUE_COLOR}
            barSize={14}
            minPointSize={3}
            radius={[0, 4, 4, 0]}
            cursor={onSelect ? 'pointer' : undefined}
            onClick={onSelect ? onBarClick<RevenueRow<T>>((row) => fire(row.source)) : undefined}
          >
            {rows.map((r, i) => (
              <Cell key={i} fill={REVENUE_COLOR} fillOpacity={anySelected && !selected?.(r.source) ? 0.35 : 1} />
            ))}
            <LabelList dataKey="revenue" content={<BarEndLabel format={compact} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
