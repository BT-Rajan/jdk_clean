import type { Feasibility } from '@/types/feasibility'
import type { Quotation } from '@/types/quotation'
import type { SalesReport } from '@/types/reports'

/**
 * Pure derivations for the Sales report's funnel and attention list.
 *
 * Everything here is computed from data the app already serves: the
 * /api/reports/sales payload plus the existing quotation / feasibility /
 * order list endpoints. Nothing is estimated -- when a source is missing
 * (or too large to have been fetched completely) the stage or item that
 * depends on it is left out rather than guessed.
 */

/** Order statuses in pipeline order, with display labels. Statuses the
 * report doesn't return are shown as zero rather than dropped. */
export const ORDER_PIPELINE: { status: string; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'in_production', label: 'In Production' },
  { status: 'ready_to_ship', label: 'Ready to Ship' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'delivered', label: 'Delivered' },
  { status: 'cancelled', label: 'Cancelled' },
]

/** Lists fetched alongside the report. A field is null when its request
 * failed or the list was larger than one fetched page (so a count taken
 * from it could be short) -- consumers must treat null as "unknown". */
export interface PipelineData {
  quotations: Quotation[] | null
  feasibilities: Feasibility[] | null
  readyToShipOrders: number | null
}

export interface FunnelStage {
  key: string
  label: string
  count: number
  /** Small qualifier under the label, e.g. "converted from quotations". */
  note?: string
  /** Conversion into the *next* stage; null on the last stage or when the
   * previous count is zero. */
  conversion: { pct: number; text: string } | null
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
}

const isoDay = (value: string) => value.slice(0, 10)

export function buildFunnel(report: SalesReport, data: PipelineData): FunnelStage[] {
  const from = isoDay(report.range_start)
  const to = isoDay(report.range_end)
  const inRange = (value: string) => {
    const day = isoDay(value)
    return day >= from && day <= to
  }

  const { total_quotations: totalQuotations, converted_quotations: converted } = report.quotation_conversion

  // The report's own quotation total is authoritative. The list is only
  // trusted for the accepted stage when it reproduces that total exactly.
  const quotesInRange = data.quotations?.filter((q) => inRange(q.quotation_date)) ?? null
  const quotesConsistent = quotesInRange !== null && quotesInRange.length === totalQuotations
  const accepted = quotesConsistent
    ? quotesInRange.filter((q) => q.status === 'accepted' || q.status === 'converted').length
    : null
  const acceptedUsable = accepted !== null && accepted >= converted

  const feasInRange = data.feasibilities?.filter((f) => inRange(f.created_at)) ?? null
  let quotedFeasibilities: number | null = null
  if (feasInRange && data.quotations) {
    const quotedIds = new Set(
      data.quotations.map((q) => q.feasibility_id).filter((id): id is number => id !== null),
    )
    quotedFeasibilities = feasInRange.filter((f) => quotedIds.has(f.id)).length
  }

  const stages: FunnelStage[] = []

  if (feasInRange) {
    const p = quotedFeasibilities !== null ? pct(quotedFeasibilities, feasInRange.length) : null
    stages.push({
      key: 'feasibility',
      label: 'Feasibility checks',
      count: feasInRange.length,
      conversion:
        p !== null && quotedFeasibilities !== null
          ? { pct: p, text: `led to a quotation (${quotedFeasibilities} of ${feasInRange.length})` }
          : null,
    })
  }

  {
    const next = acceptedUsable ? accepted : converted
    const p = pct(next, totalQuotations)
    stages.push({
      key: 'quotations',
      label: 'Quotations',
      count: totalQuotations,
      conversion:
        p !== null
          ? {
              pct: p,
              text: acceptedUsable
                ? `accepted (${accepted} of ${totalQuotations})`
                : `became orders (${converted} of ${totalQuotations})`,
            }
          : null,
    })
  }

  if (acceptedUsable) {
    const p = pct(converted, accepted)
    stages.push({
      key: 'accepted',
      label: 'Accepted quotations',
      count: accepted,
      conversion: p !== null ? { pct: p, text: `became orders (${converted} of ${accepted})` } : null,
    })
  }

  stages.push({
    key: 'orders',
    label: 'Orders',
    note: 'converted from quotations',
    count: converted,
    conversion: null,
  })

  return stages
}

export type AttentionTone = 'alert' | 'warn' | 'info'

export interface AttentionItem {
  key: string
  label: string
  count: number
  tone: AttentionTone
  /** Existing page this fact lives on. */
  to?: string
  /** Or an in-page action -- opens the report's own order drill-down. */
  drilldownStatus?: string
}

const TONE_RANK: Record<AttentionTone, number> = { alert: 0, warn: 1, info: 2 }
const OPEN_QUOTATION_STATUSES = ['draft', 'sent']
const PENDING_FEASIBILITY_STATUSES = ['draft', 'exception_pending']
const EXPIRY_WINDOW_DAYS = 7

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export interface AttentionResult {
  items: AttentionItem[]
  /** Sources that couldn't be read, so the list is honest about gaps. */
  unavailable: string[]
}

export function buildAttention(data: PipelineData, today: string): AttentionResult {
  const items: AttentionItem[] = []
  const unavailable: string[] = []

  if (data.quotations) {
    const open = data.quotations.filter((q) => OPEN_QUOTATION_STATUSES.includes(q.status))
    const pastValidity = open.filter((q) => q.valid_until && isoDay(q.valid_until) < today)
    const windowEnd = addDays(today, EXPIRY_WINDOW_DAYS)
    const expiringSoon = open.filter(
      (q) => q.valid_until && isoDay(q.valid_until) >= today && isoDay(q.valid_until) <= windowEnd,
    )
    const acceptedWaiting = data.quotations.filter((q) => q.status === 'accepted')

    items.push(
      {
        key: 'quotes-past-validity',
        label: 'Open quotations past their valid-until date',
        count: pastValidity.length,
        tone: 'alert',
        to: '/quotations',
      },
      {
        key: 'quotes-expiring',
        label: `Quotations expiring within ${EXPIRY_WINDOW_DAYS} days`,
        count: expiringSoon.length,
        tone: 'warn',
        to: '/quotations',
      },
      {
        key: 'quotes-accepted',
        label: 'Accepted quotations not yet converted to orders',
        count: acceptedWaiting.length,
        tone: 'warn',
        to: '/quotations',
      },
      {
        key: 'quotes-open',
        label: 'Quotations still open (draft or sent)',
        count: open.length,
        tone: 'info',
        to: '/quotations',
      },
    )
  } else {
    unavailable.push('quotations')
  }

  if (data.feasibilities) {
    items.push({
      key: 'feasibility-pending',
      label: 'Feasibility checks awaiting a decision',
      count: data.feasibilities.filter((f) => PENDING_FEASIBILITY_STATUSES.includes(f.status)).length,
      tone: 'warn',
      to: '/feasibilities',
    })
  } else {
    unavailable.push('feasibility checks')
  }

  if (data.readyToShipOrders !== null) {
    items.push({
      key: 'orders-ready',
      label: 'Orders ready to ship',
      count: data.readyToShipOrders,
      tone: 'info',
      drilldownStatus: 'ready_to_ship',
    })
  } else {
    unavailable.push('orders')
  }

  return {
    items: items.filter((i) => i.count > 0).sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]),
    unavailable,
  }
}
