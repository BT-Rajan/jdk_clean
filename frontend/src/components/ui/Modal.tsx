import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Expands the dialog to fill nearly the whole viewport instead of the
   * usual centered card. For content that needs real room to breathe --
   * wide tables, multi-column layouts, anything that would otherwise be
   * squeezed by max-w-2xl and 85vh (see OrgChartTab, which uses this to
   * escape the settings sidebar's narrow content column). Takes
   * precedence over `wide`. */
  fullPage?: boolean
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, title, onClose, children, footer, wide = false, fullPage = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeydown)
    return () => document.removeEventListener('keydown', onKeydown)
  }, [open, onClose])

  // Without this, Tab cycles through the whole page behind the overlay --
  // nav links, buttons on the page the modal is covering -- rather than
  // staying inside the dialog, and closing leaves focus wherever it last
  // landed (often nowhere) instead of back on whatever opened the modal.
  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    const dialog = dialogRef.current
    const focusFirst = () => {
      const first = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(first ?? dialog)?.focus()
    }
    // Wait a tick for the enter animation/mount to finish so the element
    // being focused actually exists and is visible.
    const raf = requestAnimationFrame(focusFirst)

    function onKeydown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeydown)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeydown)
      previouslyFocused.current?.focus()
    }
  }, [open])

  // Rendered into document.body via a portal rather than in place: every
  // page mounts this from inside AppLayout's <main className="relative
  // z-10">, which -- being `position: relative` with an explicit z-index --
  // establishes its own stacking context. Without the portal, the modal's
  // "fixed inset-0 z-50" only wins stacking battles *within* that z-10
  // context, so it painted underneath AppLayout's "sticky ... z-50" header
  // (the header sits in a separate, higher-stacked context) -- the header
  // visibly covered the top of any modal tall enough to reach it. Portaling
  // out of <main> entirely removes the modal from that nested context, so
  // its own z-50 is compared directly against the header's, as intended.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'glass-panel-strong w-full overflow-y-auto rounded-3xl p-6 focus:outline-none sm:p-8',
              fullPage
                ? 'm-3 h-[calc(100%-1.5rem)] max-w-none sm:m-6 sm:h-[calc(100%-3rem)]'
                : cn('m-4 max-h-[85vh]', wide ? 'max-w-2xl' : 'max-w-md'),
            )}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xl font-medium text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-white/40 transition-colors hover:text-white"
              >
                ✕
              </button>
            </div>

            {children}

            {footer && <div className="mt-8 flex justify-end gap-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
