import { cn } from '@/lib/cn'

interface LogoProps {
  className?: string
  withWordmark?: boolean
}

export function Logo({ className, withWordmark = true }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-gold-200)" />
            <stop offset="1" stopColor="var(--color-gold-600)" />
          </linearGradient>
        </defs>
        <path
          d="M32 12 L48 22 V42 L32 52 L16 42 V22 Z"
          fill="none"
          stroke="url(#logo-gradient)"
          strokeWidth="2.5"
        />
        <path d="M32 22 L40 27 V37 L32 42 L24 37 V27 Z" fill="url(#logo-gradient)" opacity="0.9" />
      </svg>
      {withWordmark && (
        <span className="font-display text-lg font-medium tracking-wide text-white">
          JDK <span className="text-gradient-gold">ERP</span>
        </span>
      )}
    </div>
  )
}
