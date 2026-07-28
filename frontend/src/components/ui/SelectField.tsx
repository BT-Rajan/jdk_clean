import { forwardRef, useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, hint, className, id, children, ...props }, ref) => {
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
            'glass-inset flex items-center rounded-xl px-4 transition-colors duration-200',
            'focus-within:border-gold-400/60 focus-within:bg-white/[0.06]',
            error && 'border-red-400/50',
          )}
        >
          <select
            ref={ref}
            id={inputId}
            className={cn(
              'h-12 w-full flex-1 appearance-none bg-transparent text-[15px] text-white outline-none',
              '[&>option]:bg-ink-800 [&>option]:text-white',
              className,
            )}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            {...props}
          >
            {children}
          </select>
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

SelectField.displayName = 'SelectField'
