import { Button, Modal } from '@/components/ui'
import { computeFeasibilityStages } from '@/lib/feasibilityStages'
import type { StageStatus } from '@/lib/feasibilityStages'
import type { Feasibility } from '@/types/feasibility'
import { cn } from '@/lib/cn'

function PassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="m8 12.5 2.6 2.6L16 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-red-400">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.4" r="1" fill="currentColor" />
    </svg>
  )
}

function SkipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white/25">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

const LABEL_TONE: Record<StageStatus, string> = {
  pass: 'text-emerald-300',
  fail: 'text-red-300',
  skipped: 'text-white/35',
}

interface FeasibilityStageResultsModalProps {
  open: boolean
  feasibility: Feasibility | null
  onClose: () => void
}

/** Pops up right after "Run check" -- walks Sales through the same
 * stock -> materials -> production-line sequence run_check just
 * evaluated, stage by stage, in the one dialog: green + tick where a
 * stage passed, red + a danger icon (with the specifics) where it
 * failed or came up short. Contacting the factory manager (the decision
 * after this readout) isn't part of this dialog -- that's still handled
 * by the Reject / Send to admin for approval actions on the page itself. */
export function FeasibilityStageResultsModal({ open, feasibility, onClose }: FeasibilityStageResultsModalProps) {
  if (!feasibility) return null
  const stages = computeFeasibilityStages(feasibility)
  const overallFeasible = feasibility.status === 'feasible'

  return (
    <Modal open={open} title="Feasibility check results" onClose={onClose} wide>
      <p className="mb-6 text-sm text-white/50">
        {overallFeasible
          ? `${feasibility.feasibility_number} can be fulfilled.`
          : `${feasibility.feasibility_number} needs your review before it can move forward.`}
      </p>

      <div className="flex flex-col divide-y divide-white/10">
        {stages.map((stage) => (
          <div key={stage.key} className="flex gap-3 py-4 first:pt-0 last:pb-0">
            <div className="shrink-0 pt-0.5">
              {stage.status === 'pass' ? <PassIcon /> : stage.status === 'fail' ? <FailIcon /> : <SkipIcon />}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-semibold', LABEL_TONE[stage.status])}>{stage.label}</p>
              <p className="mt-0.5 text-sm text-white/60">{stage.summary}</p>
              {stage.details.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-white/45">
                  {stage.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {!overallFeasible && (
        <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Reject this check, or override &amp; approve to proceed anyway -- use the buttons on the page.
        </p>
      )}

      <div className="mt-8 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
