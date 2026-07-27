import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ strong = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-3xl',
          strong ? 'glass-panel-strong' : 'glass-panel',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)

GlassCard.displayName = 'GlassCard'
