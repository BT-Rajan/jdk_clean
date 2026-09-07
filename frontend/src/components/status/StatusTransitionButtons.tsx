import { useState } from 'react'
import { Button, Modal, TextareaField } from '@/components/ui'
import { TickIcon } from '@/components/ui/icons/TickIcon'
import { CrossIcon } from '@/components/ui/icons/CrossIcon'
import { QuestionMarkIcon } from '@/components/ui/icons/QuestionMarkIcon'
import { cn } from '@/lib/cn'

interface StatusTransitionButtonsProps<S extends string> {
  /** Statuses reachable from the current one -- e.g. ORDER_TRANSITIONS[order.status]. */
  nextStatuses: S[]
  /** Which of those targets require a reason before the transition fires
   * (e.g. ['cancelled'], or ['rejected'] for quotations). */
  reasonRequiredFor?: S[]
  reasonLabel?: string
  onChange: (status: S, reason?: string) => Promise<void>
  busy?: boolean
  className?: string
}

/** A handful of status labels get an icon-only button instead of text --
 * these three specific meanings (accept/reject/pending) recur across
 * modules with the same universal symbol, unlike the rest of each
 * entity's statuses (e.g. "ready to ship", "in production") which don't
 * have an obvious single icon and stay as text. */
const STATUS_ICONS: Partial<Record<string, { icon: typeof TickIcon; variant: 'ghost' | 'danger'; iconClassName?: string }>> = {
  accepted: { icon: TickIcon, variant: 'ghost', iconClassName: 'text-emerald-300' },
  rejected: { icon: CrossIcon, variant: 'danger' },
  pending: { icon: QuestionMarkIcon, variant: 'ghost', iconClassName: 'text-white/60' },
}

/** The status-change button row used across every module's detail page
 * (Order, Quotation, Production, Delivery Note, Purchase Order) -- one
 * implementation instead of five near-identical copies. Buttons for a
 * status in `reasonRequiredFor` open a small modal to collect the reason
 * first; everything else fires immediately, same as it always has. */
export function StatusTransitionButtons<S extends string>({
  nextStatuses,
  reasonRequiredFor = [],
  reasonLabel = 'Reason',
  onChange,
  busy = false,
  className = '',
}: StatusTransitionButtonsProps<S>) {
  const [pendingStatus, setPendingStatus] = useState<S | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleClick(status: S) {
    if (reasonRequiredFor.includes(status)) {
      setPendingStatus(status)
      setReason('')
      setReasonError(null)
      return
    }
    void onChange(status)
  }

  async function handleConfirmReason() {
    if (!reason.trim()) {
      setReasonError(`${reasonLabel} is required.`)
      return
    }
    if (pendingStatus === null) return
    setSubmitting(true)
    try {
      await onChange(pendingStatus, reason.trim())
      setPendingStatus(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {nextStatuses.map((s) => {
          const iconConfig = STATUS_ICONS[s]
          const label = s.replace(/_/g, ' ')
          if (iconConfig) {
            const Icon = iconConfig.icon
            return (
              <Button
                key={s}
                variant={iconConfig.variant}
                size="sm"
                className="!w-9 !px-0"
                isLoading={busy}
                onClick={() => handleClick(s)}
                aria-label={label}
              >
                <Icon className={cn('h-4 w-4', iconConfig.iconClassName)} />
              </Button>
            )
          }
          return (
            <Button key={s} variant="ghost" size="sm" isLoading={busy} onClick={() => handleClick(s)}>
              {label}
            </Button>
          )
        })}
      </div>

      <Modal
        open={pendingStatus !== null}
        title={pendingStatus ? `Move to "${pendingStatus.replace(/_/g, ' ')}"` : ''}
        onClose={() => setPendingStatus(null)}
      >
        <div className="flex flex-col gap-4">
          <TextareaField
            label={reasonLabel}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (reasonError) setReasonError(null)
            }}
            error={reasonError ?? undefined}
          />
          <div className="mt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setPendingStatus(null)}>
              Cancel
            </Button>
            <Button type="button" isLoading={submitting} onClick={handleConfirmReason}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
