import { Badge, CrossIcon, GlassCard, Spinner, TickIcon } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { ReadinessResult } from '@/types/production'

const READY_LABEL: Record<ReadinessResult['status'], string> = {
  READY: 'READY — Can start production',
  MATERIAL_SHORTAGE: 'MATERIAL SHORTAGE',
  MACHINE_CONFLICT: 'MACHINE CONFLICT',
  WORKER_SHORTAGE: 'WORKER SHORTAGE',
  MULTIPLE_ISSUES: 'MULTIPLE ISSUES',
  NO_ACTIVE_BOM: 'NO ACTIVE BOM',
}

function CheckItem({ label, ok }: { label: string; ok: boolean | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {ok === null ? (
        <span className="h-4 w-4 shrink-0 text-white/20">—</span>
      ) : ok ? (
        <TickIcon className="h-4 w-4 shrink-0 text-emerald-300" />
      ) : (
        <CrossIcon className="h-4 w-4 shrink-0 text-red-300" />
      )}
      <span className={ok === false ? 'text-red-200' : 'text-white/80'}>{label}</span>
    </span>
  )
}

/** The "can we make this batch now?" checklist -- immediately visible on
 * the production detail page, per the task's exact simple-checklist
 * format. Pure presentation: all the material/machine/worker math comes
 * from GET /api/production-schedules/{id}/readiness, computed once by
 * production_readiness_service -- this never recomputes it. */
export function ProductionReadinessPanel({
  readiness,
  loading,
  error,
}: {
  readiness: ReadinessResult | null
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <GlassCard className="mb-6 flex justify-center p-8">
        <Spinner size={22} className="text-gold-300" />
      </GlassCard>
    )
  }

  if (error || !readiness) {
    return (
      <GlassCard className="mb-6 p-6">
        <p className="text-sm text-red-200">{error ?? 'Readiness could not be checked.'}</p>
      </GlassCard>
    )
  }

  const noBom = readiness.status === 'NO_ACTIVE_BOM'
  const materialsOk = !noBom && readiness.materials.every((m) => m.shortage <= 0)
  const machineOk = readiness.machine ? readiness.machine.ok : null
  const workersOk = readiness.workers ? readiness.workers.ok : null
  const shortMaterials = readiness.materials.filter((m) => m.shortage > 0)

  return (
    <GlassCard className="mb-6 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-white/50 uppercase">Readiness</p>
        <Badge tone={readiness.status === 'READY' ? 'success' : 'danger'}>{READY_LABEL[readiness.status]}</Badge>
      </div>

      {!noBom && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <CheckItem label="Product" ok={true} />
          <CheckItem label="BOM" ok={true} />
          <CheckItem label="Materials" ok={materialsOk} />
          <CheckItem label="Machine" ok={machineOk} />
          <CheckItem label="Workers" ok={workersOk} />
        </div>
      )}

      <p className={cn('text-sm', readiness.status === 'READY' ? 'text-white/60' : 'text-amber-100/90')}>
        {readiness.summary}
      </p>

      {shortMaterials.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {shortMaterials.map((m) => (
            <div key={m.raw_material_id} className="rounded-xl border border-red-400/20 bg-red-500/5 p-3">
              <p className="text-sm font-medium text-white">
                {m.code} — {m.name}
              </p>
              <p className="mt-1 text-xs text-white/60">
                Required {m.required} {m.unit} · Available {m.available} {m.unit} · Short {m.shortage} {m.unit}
              </p>
              {m.alternatives.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {m.alternatives.map((alt) => (
                    <p key={alt.raw_material_id} className="text-xs text-white/70">
                      Alternative: <span className="text-white">{alt.code} — {alt.name}</span> · Available{' '}
                      {alt.available} {alt.unit} · Priority {alt.priority} ·{' '}
                      <span className="capitalize text-emerald-300">{alt.status}</span>
                      {alt.conversion_ratio !== 1 && ` · Ratio ${alt.conversion_ratio}:1`}
                    </p>
                  ))}
                </div>
              )}
              {m.procurement && (
                <p className="mt-2 text-xs text-white/40">
                  Procurement (info only): {m.procurement.supplier_name} · {m.procurement.purchase_price}{' '}
                  {m.procurement.currency} · MOQ {m.procurement.moq}
                  {m.procurement.lead_time_days != null && ` · ${m.procurement.lead_time_days}d lead time`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {readiness.machine && !readiness.machine.ok && (
        <p className="mt-3 text-xs text-amber-100/80">
          {readiness.machine.machine_name}: needs {readiness.machine.required_hours}h, only{' '}
          {readiness.machine.available_hours}h free in this window.
        </p>
      )}
      {readiness.workers && !readiness.workers.ok && (
        <p className="mt-3 text-xs text-amber-100/80">
          Worker pool: needs {readiness.workers.required_hours}h, only {readiness.workers.available_hours}h free in
          this window.
        </p>
      )}
    </GlassCard>
  )
}
