import { useMemo } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { formatCurrency } from '@/lib/currency'
import type { SalesReportMonthly } from '@/types/reports'
import {
  AXIS_TICK,
  compact,
  GRID_STROKE,
  REVENUE_COLOR,
  toNumber,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from './chartHelpers'
import type { ValueType } from './chartHelpers'

const TREND_MARGIN = { top: 8, right: 12, left: 0, bottom: 0 }

/**
 * Monthly revenue as a single line (KWD), shared by the Sales report and the
 * Sales dashboard. Always fills its parent, which needs a definite height.
 * Clicking a month calls `onSelectMonth` when provided; without it the chart
 * is read-only.
 */
export function RevenueTrendChart({
  months,
  onSelectMonth,
}: {
  months: SalesReportMonthly[]
  onSelectMonth?: (month: SalesReportMonthly) => void
}) {
  const narrow = useMediaQuery('(max-width: 639px)')
  const yAxisWidth = narrow ? 36 : 44
  const maxRevenue = useMemo(() => Math.max(0, ...months.map((m) => m.revenue)), [months])

  /** The month a click refers to. A mouse hover gives recharts an active
   * index first; a touch tap arrives with none, so fall back to mapping the
   * tap's x-position onto the evenly spaced points. */
  const monthFromClick = (
    activeIndex: number | string | null | undefined,
    event: ReactMouseEvent<SVGGraphicsElement> | undefined,
  ): SalesReportMonthly | undefined => {
    if (activeIndex !== null && activeIndex !== undefined) {
      const i = Number(activeIndex)
      return Number.isInteger(i) ? months[i] : undefined
    }
    const wrapper = (event?.target as Element | null)?.closest('.recharts-wrapper')
    if (!event || !wrapper || months.length === 0) return undefined
    const rect = wrapper.getBoundingClientRect()
    const plotLeft = TREND_MARGIN.left + yAxisWidth
    const plotWidth = rect.width - plotLeft - TREND_MARGIN.right
    if (plotWidth <= 0) return undefined
    const ratio = (event.clientX - rect.left - plotLeft) / plotWidth
    if (ratio < -0.05 || ratio > 1.05) return undefined
    return months[months.length === 1 ? 0 : Math.round(Math.min(Math.max(ratio, 0), 1) * (months.length - 1))]
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={months}
        margin={TREND_MARGIN}
        style={onSelectMonth ? { cursor: 'pointer' } : undefined}
        onClick={
          onSelectMonth
            ? (state, event) => {
                const row = monthFromClick(state?.activeTooltipIndex, event)
                if (row) onSelectMonth(row)
              }
            : undefined
        }
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={14} />
        <YAxis
          tick={AXIS_TICK}
          width={yAxisWidth}
          allowDecimals={false}
          tickFormatter={(v: number) => compact(v)}
          domain={[0, maxRevenue > 0 ? 'auto' : 1]}
        />
        <Tooltip
          cursor={{ stroke: 'rgba(255,255,255,0.15)' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value: ValueType | undefined) => [formatCurrency(toNumber(value)), 'Revenue']}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={REVENUE_COLOR}
          strokeWidth={2}
          dot={{ r: 2.5, fill: REVENUE_COLOR, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
