import { Link } from 'react-router-dom'
import { Button, GlassCard } from '@/components/ui'
import type { OrderFulfillmentLine, OrderStatus } from '@/types/order'

interface FulfilmentCardProps {
  lines: OrderFulfillmentLine[]
  status: OrderStatus
  allowWrite: boolean
  busy: boolean
  onMarkReadyToShip: () => void
  onCreateDeliveryNote: () => void
  /** A delivery note already drafted for this order (the ready-to-ship automation drafts one for what is in stock). */
  draftNote: { id: number; delivery_note_number: string } | null
  onPlanProduction: () => void
}

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 10000) / 10000

/**
 * The Sales operational view of an order (spec sections 8-10): per line,
 * Ordered / Allocated / Produced / Delivered / Remaining, then the three
 * things that decide what happens next -- production shortage, QC, and
 * what can ship now. Read-only: every figure comes from
 * GET /orders/{id}/fulfillment, which draws on existing stock and
 * production data (no allocation engine here), and every action reuses an
 * existing order transition or the production-order modal.
 */
export function FulfilmentCard({
  lines,
  status,
  allowWrite,
  busy,
  onMarkReadyToShip,
  onCreateDeliveryNote,
  draftNote,
  onPlanProduction,
}: FulfilmentCardProps) {
  if (lines.length === 0) return null

  const open = status !== 'cancelled' && status !== 'delivered'
  const sameUnit = new Set(lines.map((l) => l.unit)).size === 1
  const unit = sameUnit ? (lines[0].unit ?? '') : ''
  const shortage = sum(lines.map((l) => l.shortage))
  const planned = sum(lines.map((l) => l.planned_production_quantity))
  const inProgress = sum(lines.map((l) => l.in_progress_production_quantity))
  const produced = sum(lines.map((l) => l.produced_quantity))
  const released = sum(lines.map((l) => l.released_quantity))
  const rejected = sum(lines.map((l) => l.rejected_quantity))
  const qcPending = sum(lines.map((l) => l.qc_pending_quantity))
  const deliverableNow = open ? sum(lines.map((l) => l.allocated_quantity)) : 0
  const canProduce = allowWrite && shortage > 0 && (status === 'confirmed' || status === 'in_production')
  const remainingTotal = sum(lines.map((l) => l.remaining_quantity))
  const canDeliver =
    allowWrite &&
    !draftNote &&
    remainingTotal > 0 &&
    deliverableNow > 0 &&
    (status === 'ready_to_ship' || status === 'shipped')
  const canMarkReady = allowWrite && deliverableNow > 0 && (status === 'confirmed' || status === 'in_production')
  const withUnit = (n: number) => `${n}${unit ? ` ${unit}` : ''}`

  const cell = 'px-6 py-3 text-white/60'

  return (
    <GlassCard className="mb-6 overflow-hidden">
      <div className="border-b border-white/10 px-6 py-4">
        <h2 className="font-display text-lg font-medium text-white">Fulfilment</h2>
        <p className="mt-1 text-xs text-white/40">
          Delivery draws on released finished goods; production only covers a shortage.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
              <th className="px-6 py-3 font-medium">Product</th>
              <th className="px-6 py-3 text-right font-medium">Ordered</th>
              <th className="px-6 py-3 text-right font-medium">Allocated</th>
              <th className="px-6 py-3 text-right font-medium">Produced</th>
              <th className="px-6 py-3 text-right font-medium">Delivered</th>
              <th className="px-6 py-3 text-right font-medium">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.order_detail_id} className="border-b border-white/5 last:border-0">
                <td className="px-6 py-3 text-white">
                  {line.product_code ? `${line.product_code} — ${line.product_name}` : `#${line.product_id}`}
                </td>
                <td className={`${cell} text-right`}>{line.ordered_quantity}</td>
                <td className={`${cell} text-right`}>{open ? line.allocated_quantity : '—'}</td>
                <td className={`${cell} text-right`}>
                  {line.produced_quantity}
                  {line.qc_pending_quantity > 0 && (
                    <span className="ml-1 text-xs text-amber-200">({line.qc_pending_quantity} in QC)</span>
                  )}
                </td>
                <td className={`${cell} text-right`}>{line.delivered_quantity}</td>
                <td className="px-6 py-3 text-right font-medium text-white">{line.remaining_quantity}</td>
              </tr>
            ))}
            {lines.length > 1 && sameUnit && (
              <tr className="border-t border-white/10 text-white/80">
                <td className="px-6 py-3 text-xs uppercase tracking-wide text-white/40">Total</td>
                <td className="px-6 py-3 text-right">{sum(lines.map((l) => l.ordered_quantity))}</td>
                <td className="px-6 py-3 text-right">{open ? deliverableNow : '—'}</td>
                <td className="px-6 py-3 text-right">{produced}</td>
                <td className="px-6 py-3 text-right">{sum(lines.map((l) => l.delivered_quantity))}</td>
                <td className="px-6 py-3 text-right font-medium text-white">{sum(lines.map((l) => l.remaining_quantity))}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="grid gap-px border-t border-white/10 bg-white/10 text-sm sm:grid-cols-3">
          <div className="bg-[#0b0d12]/60 px-6 py-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Production</p>
            {shortage > 0 ? (
              <p className="mt-1 text-amber-200">
                {withUnit(shortage)} short
                {(planned > 0 || inProgress > 0) && (
                  <span className="text-white/50">
                    {' '}
                    — {[planned > 0 && `${planned} planned`, inProgress > 0 && `${inProgress} in progress`]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-white/60">No production needed</p>
            )}
          </div>
          <div className="bg-[#0b0d12]/60 px-6 py-4">
            <p className="text-xs uppercase tracking-wide text-white/40">QC</p>
            {produced > 0 ? (
              <p className="mt-1 text-white/60">
                {qcPending > 0 && <span className="text-amber-200">{qcPending} awaiting QC · </span>}
                {released} released
                {rejected > 0 && ` · ${rejected} rejected`}
              </p>
            ) : (
              <p className="mt-1 text-white/40">Nothing produced for this order</p>
            )}
          </div>
          <div className="bg-[#0b0d12]/60 px-6 py-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Ready to ship</p>
            <p className={deliverableNow > 0 ? 'mt-1 text-emerald-200' : 'mt-1 text-white/40'}>
              {deliverableNow > 0 ? `${withUnit(deliverableNow)} can ship now` : 'Nothing in stock to ship yet'}
            </p>
          </div>
        </div>
      )}

      {draftNote && open && (
        <div className="border-t border-white/10 px-6 py-4 text-sm text-white/60">
          Delivery note{' '}
          <Link to={`/delivery-notes/${draftNote.id}`} className="font-medium text-gold-300 hover:text-gold-200">
            {draftNote.delivery_note_number}
          </Link>{' '}
          is drafted for what is in stock -- review and issue it.
        </div>
      )}

      {(canProduce || canMarkReady || canDeliver) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-6 py-4">
          {canDeliver && (
            <Button size="sm" onClick={onCreateDeliveryNote} isLoading={busy}>
              Create delivery note ({withUnit(deliverableNow)})
            </Button>
          )}
          {canMarkReady && (
            <Button size="sm" onClick={onMarkReadyToShip} isLoading={busy}>
              Ready to ship ({withUnit(deliverableNow)})
            </Button>
          )}
          {canProduce && (
            <Button variant="ghost" size="sm" onClick={onPlanProduction}>
              Plan production for the shortage
            </Button>
          )}
          {canMarkReady && shortage > 0 && (
            <span className="text-xs text-white/40">
              Ships what is available now; the rest goes on a later delivery note.
            </span>
          )}
          {canDeliver && deliverableNow < remainingTotal && (
            <span className="text-xs text-white/40">
              Partial delivery: the note carries what is in stock; the remaining {remainingTotal - deliverableNow}{' '}
              follows on another note.
            </span>
          )}
        </div>
      )}
    </GlassCard>
  )
}
