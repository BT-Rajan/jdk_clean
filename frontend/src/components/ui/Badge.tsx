import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'gold' | 'success' | 'danger' | 'info'

interface BadgeProps {
  children: string
  tone?: Tone
  className?: string
}

const toneStyles: Record<Tone, string> = {
  neutral: 'border-white/15 bg-white/5 text-white/60',
  gold: 'border-gold-400/30 bg-gold-500/10 text-gold-200',
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  danger: 'border-red-400/30 bg-red-500/10 text-red-200',
  info: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
}

/** Status tone lookup shared by every module -- keeps color meaning
 * consistent (active/confirmed-style green, draft/neutral grey, danger
 * red, etc.) regardless of which entity's status is being shown. */
const STATUS_TONES: Record<string, Tone> = {
  active: 'success',
  inactive: 'neutral',
  suspended: 'danger',
  draft: 'neutral',
  planned: 'neutral',
  in_progress: 'gold',
  sent: 'info',
  accepted: 'success',
  confirmed: 'success',
  in_production: 'gold',
  ready_to_ship: 'gold',
  shipped: 'info',
  delivered: 'success',
  converted: 'info',
  rejected: 'danger',
  cancelled: 'danger',
  expired: 'danger',
  completed: 'success',
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide capitalize',
        toneStyles[tone],
        className,
      )}
    >
      {children.replace(/_/g, ' ')}
    </span>
  )
}

/** Convenience wrapper: picks the tone automatically from a known status
 * string (falls back to 'neutral' for anything unrecognized). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {status}
    </Badge>
  )
}
