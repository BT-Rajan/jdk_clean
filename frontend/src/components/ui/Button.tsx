import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger'
type Size = 'md' | 'sm'

type ConflictingHandlers = 'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, ConflictingHandlers> {
  variant?: Variant
  size?: Size
  isLoading?: boolean
  leftIcon?: ReactNode
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-gold-300 to-gold-600 text-ink-950 shadow-glow-gold hover:from-gold-200 hover:to-gold-500 focus-visible:outline-gold-200',
  ghost:
    'glass-inset text-gold-100 hover:bg-white/10 focus-visible:outline-gold-300',
  subtle:
    'text-white/70 hover:text-white hover:bg-white/5',
  danger:
    'bg-gradient-to-b from-red-400 to-red-600 text-white shadow-glow-gold hover:from-red-300 hover:to-red-500 focus-visible:outline-red-300',
}

const sizeStyles: Record<Size, string> = {
  md: 'h-12 px-6 text-sm',
  sm: 'h-9 px-4 text-xs',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', isLoading = false, leftIcon, className, children, disabled, ...props },
    ref,
  ) => {
    return (
      <motion.button
        ref={ref}
        type={props.type ?? 'button'}
        whileHover={disabled || isLoading ? undefined : { scale: 1.015 }}
        whileTap={disabled || isLoading ? undefined : { scale: 0.98 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-wide',
          'transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        <span className={cn('inline-flex items-center gap-2', isLoading && 'invisible')}>
          {leftIcon}
          {children}
        </span>
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size={size === 'sm' ? 14 : 18} />
          </span>
        )}
      </motion.button>
    )
  },
)

Button.displayName = 'Button'
