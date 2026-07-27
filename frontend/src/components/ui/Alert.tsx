import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

type AlertVariant = 'error' | 'success'

interface AlertProps {
  variant?: AlertVariant
  children: string | null | undefined
}

const variantStyles: Record<AlertVariant, string> = {
  error: 'border-red-400/30 bg-red-500/10 text-red-200',
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
}

/** Renders nothing when `children` is falsy, so callers can pass
 * `errorMessage` directly without an extra conditional. */
export function Alert({ variant = 'error', children }: AlertProps) {
  return (
    <AnimatePresence>
      {children && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.2 }}
          className={cn('overflow-hidden rounded-xl border px-4 py-3 text-sm', variantStyles[variant])}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
