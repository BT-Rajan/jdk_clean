import { forwardRef, useState } from 'react'
import { TextField } from './TextField'
import type { TextFieldProps } from './TextField'

export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'type' | 'trailingSlot'>>(
  (props, ref) => {
    const [visible, setVisible] = useState(false)

    return (
      <TextField
        ref={ref}
        type={visible ? 'text' : 'password'}
        trailingSlot={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="shrink-0 text-xs font-medium text-white/40 transition-colors hover:text-gold-300"
            aria-label={visible ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        }
        {...props}
      />
    )
  },
)

PasswordField.displayName = 'PasswordField'
