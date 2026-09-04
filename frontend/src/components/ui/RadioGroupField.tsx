import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface RadioGroupOption {
  value: string
  label: string
}

export interface RadioGroupFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> {
  label: string
  options: RadioGroupOption[]
  error?: string
  hint?: string
}

/** A labelled set of mutually-exclusive radio buttons, styled to match
 * TextField/SelectField. Spread {...register('field')} onto it the same
 * way as those -- react-hook-form registers each underlying <input
 * type="radio"> under the shared `name`. */
export const RadioGroupField = forwardRef<HTMLInputElement, RadioGroupFieldProps>(
  ({ label, options, error, hint, name, className, id, ...props }, ref) => {
    const generatedId = useId()
    const groupId = id ?? generatedId
    const labelId = `${groupId}-label`
    const errorId = `${groupId}-error`
    const hintId = `${groupId}-hint`

    return (
      <div className="w-full">
        <span id={labelId} className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/55">
          {label}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn('flex flex-wrap gap-3', className)}
        >
          {options.map((option) => {
            const inputId = `${groupId}-${option.value}`
            return (
              <label
                key={option.value}
                htmlFor={inputId}
                className={cn(
                  'glass-inset flex cursor-pointer items-center gap-2.5 rounded-xl px-4 py-3 text-[15px] text-white transition-colors duration-200',
                  'has-[:checked]:border-gold-400/60 has-[:checked]:bg-white/[0.06]',
                  error && 'border-red-400/50',
                )}
              >
                <input
                  {...props}
                  // react-hook-form tracks every same-name radio it's given a
                  // ref to (it keeps an internal list per field name), and
                  // reads the group's checked value from that list -- give
                  // it only the first option's ref and toggling to any other
                  // option makes the field's tracked value go stale (it never
                  // sees this element's checked state), so every option needs
                  // the same ref forwarded, not just one.
                  ref={ref}
                  id={inputId}
                  type="radio"
                  name={name}
                  value={option.value}
                  className="h-4 w-4 accent-gold-400"
                />
                {option.label}
              </label>
            )
          })}
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

RadioGroupField.displayName = 'RadioGroupField'
