import { Link } from 'react-router-dom'
import { GlassCard } from '@/components/ui'
import { cn } from '@/lib/cn'

export interface StatsWidgetProps {
  title: string
  value: string | number
  unit?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  icon?: React.ReactNode
  /** Route to navigate to when the card is clicked, e.g. '/quotations'. Omit for a static card. */
  to?: string
}

export function StatsWidget({ title, value, unit, trend, icon, to }: StatsWidgetProps) {
  const card = (
    <GlassCard
      className={cn(
        'p-6',
        to && 'cursor-pointer transition-colors hover:border-gold-400/30 hover:bg-white/[0.07]',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-white/50">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-white">{value}</p>
            {unit && <p className="text-sm text-white/40">{unit}</p>}
          </div>
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className={trend.isPositive ? 'text-green-400' : 'text-red-400'}
              >
                <path
                  d={
                    trend.isPositive
                      ? 'M6 2L10 8H2L6 2Z'
                      : 'M6 10L2 4H10L6 10Z'
                  }
                  fill="currentColor"
                />
              </svg>
              <span className={`text-xs ${trend.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            </div>
          )}
        </div>
        {icon && <div className="text-gold-300/30">{icon}</div>}
      </div>
    </GlassCard>
  )

  return to ? (
    <Link to={to} aria-label={`Open ${title}`}>
      {card}
    </Link>
  ) : (
    card
  )
}

export interface GraphWidgetProps {
  title: string
  data: Array<{
    label: string
    value: number
  }>
}

export function GraphWidget({ title, data }: GraphWidgetProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1)

  return (
    <GlassCard className="p-6">
      <h3 className="mb-6 text-sm font-medium text-white">{title}</h3>
      <div className="space-y-4">
        {data.map((item, idx) => (
          <div key={idx}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-white/60">{item.label}</span>
              <span className="text-xs font-medium text-gold-300">{item.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-all duration-500"
                style={{
                  width: `${(item.value / maxValue) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

export interface SkeletonWidgetProps {
  type?: 'stats' | 'graph'
}

export function SkeletonWidget({ type = 'stats' }: SkeletonWidgetProps) {
  return (
    <GlassCard className="p-6">
      {type === 'stats' ? (
        <>
          <div className="mb-3 h-4 w-24 rounded bg-white/10" />
          <div className="h-8 w-32 rounded bg-white/10" />
          <div className="mt-2 h-3 w-16 rounded bg-white/5" />
        </>
      ) : (
        <>
          <div className="mb-6 h-4 w-28 rounded bg-white/10" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="mb-1 h-3 w-20 rounded bg-white/10" />
                <div className="h-2 rounded-full bg-white/5" />
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  )
}
