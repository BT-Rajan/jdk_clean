import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import type { ButtonProps } from './Button'
import { Spinner } from './Spinner'
import { ThumbsUpIcon } from './icons/ThumbsUpIcon'
import { ThumbsDownIcon } from './icons/ThumbsDownIcon'

export interface ApprovalMenuProps {
  onApprove: () => void | Promise<void>
  onReject: () => void | Promise<void>
  approveLabel?: string
  rejectLabel?: string
  /** Accessible name for the closed trigger button. */
  ariaLabel?: string
  size?: ButtonProps['size']
  isLoading?: boolean
  className?: string
}

/**
 * A single icon button (thumbs up) that opens a small dropdown with two
 * choices -- Approve (thumbs up) and Reject (thumbs down, in red) -- for
 * the admin approve/reject decision pairs (e.g. a feasibility exception
 * override). Same interaction shape as DownloadMenu: closes on outside
 * click, Escape, or after a selection.
 */
export function ApprovalMenu({
  onApprove,
  onReject,
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
  ariaLabel = 'Approve or reject',
  size = 'sm',
  isLoading = false,
  className,
}: ApprovalMenuProps) {
  const [open, setOpen] = useState(false)
  const [pendingKey, setPendingKey] = useState<'approve' | 'reject' | null>(null)
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

  async function handleSelect(key: 'approve' | 'reject') {
    if (pendingKey) return
    setPendingKey(key)
    try {
      await (key === 'approve' ? onApprove() : onReject())
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
        variant="primary"
        size={size}
        className="!w-9 !px-0"
        isLoading={isLoading && !pendingKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <ThumbsUpIcon />
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
              'glass-panel absolute right-0 z-50 mt-2 min-w-[9rem] overflow-hidden rounded-xl',
              'border border-white/10 bg-ink-900/95 py-1 shadow-glow-gold backdrop-blur-xl',
            )}
          >
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => handleSelect('approve')}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-emerald-200',
                'transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <ThumbsUpIcon />
                {approveLabel}
              </span>
              {pendingKey === 'approve' && <Spinner size={14} />}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => handleSelect('reject')}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-red-300',
                'transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <ThumbsDownIcon />
                {rejectLabel}
              </span>
              {pendingKey === 'reject' && <Spinner size={14} />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
