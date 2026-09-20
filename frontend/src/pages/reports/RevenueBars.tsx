import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
 * `onSelect` is given.
 */
export function RevenueBars<T>({
  rows,
  height,
  onSelect,
}: {
  rows: RevenueRow<T>[]
  height?: number
  onSelect?: (row: T) => void
}) {
  const narrow = useMediaQuery('(max-width: 639px)')
  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 0)
  return (
    <div className="w-full" style={{ height: height ?? '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={rows} margin={{ top: 0, right: 44, left: 0, bottom: 0 }}>
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
            onClick={onSelect ? onBarClick<RevenueRow<T>>((row) => onSelect(row.source)) : undefined}
          >
            <LabelList dataKey="revenue" content={<BarEndLabel format={compact} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
