import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  leadingIcon?: ReactNode
  trailingSlot?: ReactNode
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, leadingIcon, trailingSlot, className, id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/55"
        >
          {label}
        </label>

        <div
          className={cn(
            'glass-inset flex items-center gap-2.5 rounded-xl px-4 transition-colors duration-200',
            'focus-within:border-gold-400/60 focus-within:bg-white/[0.06]',
            error && 'border-red-400/50',
          )}
        >
          {leadingIcon && <span className="text-white/40">{leadingIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'h-12 w-full flex-1 bg-transparent text-[15px] text-white placeholder-white/30 outline-none',
              className,
            )}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            {...props}
          />
          {trailingSlot}
        </div>

        {error ? (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-400">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-xs text-white/40">
            {hint}
          </p>
        ) : null}
      </div>
    )
  },
)

TextField.displayName = 'TextField'
