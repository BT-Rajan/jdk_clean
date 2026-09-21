import { StatusBadge } from '@/components/ui'
import type { OrderStatus } from '@/types/order'

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'ready_to_ship', label: 'Ready to ship' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
]

/**
 * The order's lifecycle: Draft -> Confirmed -> Ready to ship -> Shipped ->
 * Delivered. 'in_production' is a real status the production module drives,
 * but it isn't a lifecycle *step* of the order (Sales spec section 8):
 * production is a separate track, so the order still reads as Confirmed
 * and production shows up as its own chip beside it.
 */
export function OrderLifecycle({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') return <StatusBadge status={status} />

  const stepKey: OrderStatus = status === 'in_production' ? 'confirmed' : status
  const current = STEPS.findIndex((step) => step.key === stepKey)

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Order lifecycle">
      {STEPS.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo'
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={
                state === 'current'
                  ? 'rounded-full border border-gold-300/40 bg-gold-300/15 px-2.5 py-1 font-medium text-gold-200'
                  : state === 'done'
                    ? 'px-1 text-white/60'
                    : 'px-1 text-white/30'
              }
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {state === 'done' && <span aria-hidden="true">✓ </span>}
              {step.label}
            </span>
            {index < STEPS.length - 1 && <span className="text-white/20" aria-hidden="true">›</span>}
          </li>
        )
      })}
      {status === 'in_production' && (
        <li className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-200">
          In production
        </li>
      )}
    </ol>
  )
}
