import { forwardRef, useId } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  hint?: string
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, error, hint, className, id, rows = 3, ...props }, ref) => {
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
            'glass-inset flex items-center rounded-xl px-4 py-3 transition-colors duration-200',
            'focus-within:border-gold-400/60 focus-within:bg-white/[0.06]',
            error && 'border-red-400/50',
          )}
        >
          <textarea
            ref={ref}
            id={inputId}
            rows={rows}
            className={cn(
              'w-full flex-1 resize-none bg-transparent text-[15px] text-white placeholder-white/30 outline-none',
              className,
            )}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            {...props}
          />
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

TextareaField.displayName = 'TextareaField'
