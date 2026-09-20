import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GlassCard, Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'
import { AXIS_TICK } from './chartHelpers'
import type { AttentionItem, AttentionResult, AttentionTone, FunnelStage } from './salesReportModel'

/** One consistent frame for every analytical block on the Sales report. */
export function Panel({
  title,
  hint,
  className,
  bodyClassName,
  children,
}: {
  title: string
  hint?: string
  className?: string
  /** Extra classes for the content area -- e.g. a min-height, or `relative`
   * so a chart can fill it with `absolute inset-0`. */
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <GlassCard className={cn('flex h-full min-w-0 flex-col p-4 sm:p-5', className)}>
      <div className="mb-3">
        <h2 className="font-display text-base font-medium text-white">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-white/40">{hint}</p>}
      </div>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </GlassCard>
  )
}

export function KpiTile({
  label,
  value,
  unit,
  note,
  className,
}: {
  label: string
  value: string | number
  unit?: string
  note?: string
  className?: string
}) {
  // The card is a size container so the figure steps down to fit a narrow
  // tile instead of overflowing it (Tailwind @container variants).
  return (
    <GlassCard className={cn('@container min-w-0 px-4 py-3.5 sm:px-5', className)}>
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
        <span className="text-xl leading-tight font-semibold tracking-tight text-white tabular-nums @[9rem]:text-2xl @[12rem]:text-[1.7rem]">
          {value}
        </span>
        {unit && <span className="text-xs text-white/40">{unit}</span>}
      </p>
      {note && <p className="mt-1.5 text-xs text-white/35">{note}</p>}
    </GlassCard>
  )
}

const FUNNEL_MIN_WIDTH = 58 // % of the panel -- keeps the smallest stage's label readable

/** `fill` spreads the stages over the height of the parent instead of
 * stacking them at the top -- for a panel that is taller than the funnel. */
export function SalesFunnel({ stages, fill = false }: { stages: FunnelStage[]; fill?: boolean }) {
  const max = Math.max(...stages.map((s) => s.count), 1)

  return (
    <ol className={cn('mx-auto flex w-full max-w-[32rem] flex-col items-center', fill && 'h-full justify-around gap-1')} aria-label="Sales funnel">
      {stages.map((stage, i) => {
        const width = FUNNEL_MIN_WIDTH + (100 - FUNNEL_MIN_WIDTH) * (stage.count / max)
        const isOutcome = i === stages.length - 1
        return (
          <li key={stage.key} className="flex w-full flex-col items-center">
            <div
              style={{ width: `${width}%` }}
              className={cn(
                'flex min-w-[10.5rem] items-center justify-between gap-3 rounded-xl border px-3.5 py-1.5',
                isOutcome
                  ? 'border-emerald-400/30 bg-emerald-400/10'
                  : 'border-gold-300/25 bg-gold-400/10',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-white/90">{stage.label}</p>
                {stage.note && <p className="truncate text-[11px] text-white/40">{stage.note}</p>}
              </div>
              <p className="text-lg leading-none font-semibold text-white tabular-nums">{stage.count}</p>
            </div>

            {stage.conversion && (
              <div className="my-1 flex items-center gap-1.5 text-[11px] text-white/45">
                <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-white/30" fill="none" aria-hidden="true">
                  <path d="M6 2v8m0 0L3 7m3 3l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-medium text-gold-200 tabular-nums">{stage.conversion.pct}%</span>
                <span className="truncate">{stage.conversion.text}</span>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const TONE_DOT: Record<AttentionTone, string> = {
  alert: 'bg-red-400',
  warn: 'bg-amber-300',
  info: 'bg-gold-400/70',
}

const ROW_CLASS =
  'group flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-white/[0.04]'

function AttentionRow({ item, onDrilldown }: { item: AttentionItem; onDrilldown: (status: string, label: string) => void }) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[item.tone])} aria-hidden="true" />
        <span className="text-sm text-white/85">{item.label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-semibold text-white tabular-nums">{item.count}</span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-white/25 transition-colors group-hover:text-gold-300" fill="none" aria-hidden="true">
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </>
  )

  if (item.to) {
    return (
      <Link to={item.to} className={ROW_CLASS}>
        {content}
      </Link>
    )
  }
  const status = item.drilldownStatus
  return (
    <button
      type="button"
      className={ROW_CLASS}
      onClick={() => status && onDrilldown(status, status.replace(/_/g, ' '))}
    >
      {content}
    </button>
  )
}

export function SalesAttention({
  result,
  loading,
  onDrilldown,
}: {
  result: AttentionResult | null
  loading: boolean
  onDrilldown: (status: string, label: string) => void
}) {
  if (loading || !result) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size={20} className="text-gold-300" />
      </div>
    )
  }

  return (
    <div>
      {result.items.length === 0 ? (
        <p className="py-3 text-sm text-white/50">Nothing in Sales needs action right now.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-white/5">
          {result.items.map((item) => (
            <li key={item.key}>
              <AttentionRow item={item} onDrilldown={onDrilldown} />
            </li>
          ))}
        </ul>
      )}
      {result.unavailable.length > 0 && (
        <p className="mt-2 text-xs text-amber-300/80">
          Couldn&apos;t fully load {result.unavailable.join(', ')}, so related items are not shown.
        </p>
      )}
    </div>
  )
}

/** Y-axis category label that never wraps -- recharts' default tick wraps a
 * label onto extra lines as soon as it nears the axis width, which turns
 * "In Production" and product names into two-line stacks. Pair with a
 * tickFormatter-style `format` to truncate instead. */
export function NoWrapYTick({
  x = 0,
  y = 0,
  payload,
  format,
}: {
  x?: number
  y?: number
  payload?: { value?: string | number }
  format?: (value: string) => string
}) {
  const text = String(payload?.value ?? '')
  return (
    <text x={x - 4} y={y} dy={4} textAnchor="end" fill={AXIS_TICK.fill} fontSize={AXIS_TICK.fontSize}>
      {format ? format(text) : text}
    </text>
  )
}

/** Value label at the end of a horizontal bar. Unlike recharts' built-in
 * position="right" label it also draws for zero-length bars, so an empty
 * status reads as an explicit 0 rather than a missing row. */
export function BarEndLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  format,
}: {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: number | string
  format?: (value: number) => string
}) {
  const n = Number(value ?? 0)
  return (
    <text
      x={Number(x) + Number(width) + 6}
      y={Number(y) + Number(height) / 2}
      dy={4}
      fill="rgba(255,255,255,0.6)"
      fontSize={11}
    >
      {format ? format(n) : n}
    </text>
  )
}
