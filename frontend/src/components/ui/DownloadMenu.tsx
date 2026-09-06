import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import type { ButtonProps } from './Button'
import { Spinner } from './Spinner'
import { DownloadIcon } from './icons/DownloadIcon'

export interface DownloadMenuOption {
  /** Unique key for React list rendering. */
  key: string
  /** Text shown in the menu row, e.g. "PDF", "Word (EN)", "Word (AR)". */
  label: string
  onSelect: () => void | Promise<void>
  /** Disable just this one row (e.g. a format that isn't ready yet). */
  disabled?: boolean
}

export interface DownloadMenuProps {
  /** Label on the closed button, e.g. "Download". Also used as the aria-label when iconOnly. */
  label?: string
  options: DownloadMenuOption[]
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  /** External busy flag (e.g. a shared page-level `busy` state) shown as a spinner on the trigger. */
  isLoading?: boolean
  className?: string
  /** Render just the download icon (no text label, no chevron) instead of a labeled button. */
  iconOnly?: boolean
}

/**
 * A single button that opens a small dropdown of format choices, so pages
 * that used to show "Download PDF" / "Word (EN)" / "Word (AR)" as three
 * separate buttons can offer one "Download ▾" button instead. Closes on
 * outside click, Escape, or after a selection.
 */
export function DownloadMenu({
  label = 'Download',
  options,
  variant = 'ghost',
  size = 'md',
  isLoading = false,
  className,
  iconOnly = false,
}: DownloadMenuProps) {
  const [open, setOpen] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleSelect(option: DownloadMenuOption) {
    if (option.disabled || pendingKey) return
    setPendingKey(option.key)
    try {
      await option.onSelect()
    } finally {
      setPendingKey(null)
      setOpen(false)
    }
  }

  const busy = isLoading || pendingKey !== null

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={iconOnly ? '!w-9 !px-0' : undefined}
        isLoading={isLoading && !pendingKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? label : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {iconOnly ? (
          <DownloadIcon />
        ) : (
          <>
            {label}
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 6"
              fill="none"
              className={cn('transition-transform duration-150', open && 'rotate-180')}
              aria-hidden="true"
            >
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className={cn(
              'glass-panel absolute right-0 z-50 mt-2 min-w-[10rem] overflow-hidden rounded-xl',
              'border border-white/10 bg-ink-900/95 py-1 shadow-glow-gold backdrop-blur-xl',
            )}
          >
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                role="menuitem"
                disabled={option.disabled || busy}
                onClick={() => handleSelect(option)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-gold-100',
                  'transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {option.label}
                {pendingKey === option.key && <Spinner size={14} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
