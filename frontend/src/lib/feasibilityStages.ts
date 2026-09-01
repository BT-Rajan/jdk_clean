import { formatDate } from '@/lib/dateFormat'
import type { Feasibility, FeasibilityLine } from '@/types/feasibility'

export type StageStatus = 'pass' | 'fail' | 'skipped'

export interface FeasibilityStage {
  key: 'stock' | 'materials' | 'capacity'
  label: string
  status: StageStatus
  /** One-line verdict shown next to the stage name. */
  summary: string
  /** Extra detail lines (shortfalls, missing resources) shown under the stage. */
  details: string[]
}

function quantityToProduce(line: FeasibilityLine): number {
  return Math.max(Math.round((line.quantity - (line.covered_by_stock ?? 0)) * 10000) / 10000, 0)
}

function lineLabel(line: FeasibilityLine): string {
  return line.product_code ?? `#${line.product_id}`
}

/**
 * Turns a checked feasibility's line-level results (already computed by
 * feasibility_service.run_check) into the 3-stage pass/fail readout Sales
 * sees in the run-check dialog:
 *
 *   1. Finished goods stock
 *   2. Raw materials, including packaging -- packaging items aren't a
 *      separate check: they're just BOM components like any other raw
 *      material, so a shortage of boxes/labels/etc surfaces here exactly
 *      like a shortage of any other ingredient.
 *   3. Production line -- manpower and production line slot
 *
 * Each stage after the first only evaluates whatever quantity the
 * previous stage didn't already clear, mirroring run_check's own
 * stock -> materials -> capacity order exactly, just summarized across
 * every line instead of shown per line. A stage that isn't reached
 * (because an earlier one already resolved the order, or already failed)
 * comes back 'skipped' rather than pass/fail.
 *
 * Returns [] before the check has actually been run (no checked_at yet).
 */
export function computeFeasibilityStages(f: Feasibility): FeasibilityStage[] {
  if (!f.checked_at || f.lines.length === 0) return []

  const linesNeedingProduction = f.lines.filter((l) => quantityToProduce(l) > 0)

  // Stage 1 -- finished goods stock
  const stockStage: FeasibilityStage =
    linesNeedingProduction.length === 0
      ? {
          key: 'stock',
          label: 'Finished goods stock',
          status: 'pass',
          summary: 'Fully available in stock now.',
          details: [],
        }
      : {
          key: 'stock',
          label: 'Finished goods stock',
          status: 'fail',
          summary:
            linesNeedingProduction.length === f.lines.length
              ? 'No stock available for this order -- checking raw materials next.'
              : 'Only partially covered by stock -- checking raw materials for the rest.',
          details: linesNeedingProduction.map((l) => {
            const short = quantityToProduce(l)
            return l.covered_by_stock
              ? `${lineLabel(l)}: ${l.covered_by_stock} in stock, ${short} short`
              : `${lineLabel(l)}: ${short} short (none in stock)`
          }),
        }

  if (stockStage.status === 'pass') {
    return [
      stockStage,
      skippedStage('materials', 'Raw materials (incl. packaging)', 'Not needed -- order is fully covered by stock.'),
      skippedStage('capacity', 'Production line (manpower & slot)', 'Not needed -- order is fully covered by stock.'),
    ]
  }

  // Stage 2 -- raw materials, including packaging (see doc comment above)
  const materialShortfallLines = linesNeedingProduction.filter((l) => l.is_feasible === false)
  const materialsStage: FeasibilityStage =
    materialShortfallLines.length === 0
      ? {
          key: 'materials',
          label: 'Raw materials (incl. packaging)',
          status: 'pass',
          summary: 'Everything needed to produce the shortfall is in stock.',
          details: [],
        }
      : {
          key: 'materials',
          label: 'Raw materials (incl. packaging)',
          status: 'fail',
          summary: "Short on materials -- production line can't be checked until this is resolved.",
          details: materialShortfallLines.flatMap((l) =>
            l.bom_missing
              ? [`${lineLabel(l)}: no formula (BOM) set up for this product`]
              : l.shortfalls.map(
                  (s) => `${s.code} — short ${s.shortfall} ${s.unit} (need ${s.required}, have ${s.on_hand})`,
                ),
          ),
        }

  if (materialsStage.status === 'fail') {
    return [
      stockStage,
      materialsStage,
      skippedStage(
        'capacity',
        'Production line (manpower & slot)',
        'Not evaluated -- resolve the material shortfall first.',
      ),
    ]
  }

  // Stage 3 -- production line: manpower + production line slot
  const capacityFailLines = linesNeedingProduction.filter((l) => l.capacity_ok === false)
  let capacityStage: FeasibilityStage
  if (capacityFailLines.length > 0) {
    capacityStage = {
      key: 'capacity',
      label: 'Production line (manpower & slot)',
      status: 'fail',
      summary: 'Not enough production line time or manpower to meet the required date.',
      details: capacityFailLines.map((l) => {
        const s = l.capacity_shortfall
        if (!s) return `${lineLabel(l)}: not achievable in time`

        // Name the specific resource that's actually missing -- production
        // line slot, manpower, or both -- rather than a generic shortfall.
        const missing: string[] = []
        if (!s.machine_available) missing.push(`production line slot (${s.machine}, needs ${s.required_hours} hrs)`)
        if (s.workers_available === false) missing.push(`manpower (needs ${s.workers_required} workers)`)
        const what = missing.length > 0 ? missing.join(' and ') : s.machine

        const when = s.projected_completion_date
          ? `earliest possible: ${formatDate(s.projected_completion_date)}${
              s.shortfall_days ? ` (${s.shortfall_days} day${s.shortfall_days === 1 ? '' : 's'} late)` : ''
            }`
          : 'not achievable within the next year at current bookings'
        return `${lineLabel(l)}: not available — ${what} — ${when}`
      }),
    }
  } else {
    const readyDates = linesNeedingProduction
      .map((l) => l.estimated_ready_date)
      .filter((d): d is string => Boolean(d))
    const latestReadyDate = readyDates.length > 0 ? readyDates.reduce((a, b) => (a > b ? a : b)) : null
    capacityStage = {
      key: 'capacity',
      label: 'Production line (manpower & slot)',
      status: 'pass',
      summary: latestReadyDate
        ? `Manpower and production line slot available -- ready by ${formatDate(latestReadyDate)}.`
        : 'Manpower and production line slot available.',
      details: [],
    }
  }

  return [stockStage, materialsStage, capacityStage]
}

function skippedStage(key: FeasibilityStage['key'], label: string, summary: string): FeasibilityStage {
  return { key, label, status: 'skipped', summary, details: [] }
}
