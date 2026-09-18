import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Alert, Badge, Field, GlassCard, PageHeader, SelectField, Spinner, StatusBadge } from '@/components/ui'
import { Button, EmptyState, TextField } from '@/components/ui'
import {
  allocateMaterial,
  calculateMaterialRequirements,
  cancelProductionExecution,
  cancelProductionOrderSchedule,
  completeProductionExecution,
  createProductionOrderSchedule,
  getMaterialRequirements,
  getProductionExecutions,
  getProductionOrder,
  getProductionOrderSchedules,
  releaseMaterialAllocation,
  startProductionExecution,
  updateProductionOrderStatus,
} from '@/api/productionOrders'
import { getOrder } from '@/api/orders'
import { listMachines } from '@/api/machines'
import { listQcAgents, createQcAgent } from '@/api/qcAgents'
import {
  listQcRequests,
  createQcRequest,
  markQcSampleSent,
  recordQcReport,
  recordQcResult,
  uploadQcReportDocument,
} from '@/api/qcRequests'
import type { ProductionOrder } from '@/types/productionOrder'
import type { Order } from '@/types/order'
import type { MaterialRequirementSummary } from '@/types/materialRequirement'
import type { ProductionOrderScheduleSummary } from '@/types/productionOrderSchedule'
import type { ProductionExecutionRun, ProductionExecutionSummary } from '@/types/productionOrderExecution'
import type { Machine } from '@/types/machine'
import type { QcAgent } from '@/types/qcAgent'
import type { QcRequest, QcRequestStatus } from '@/types/qcRequest'
import { getApiErrorMessage } from '@/lib/apiError'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { HistoryTimeline } from '@/components/history/HistoryTimeline'
import { useAuth } from '@/hooks/useAuth'
import { canWriteDepartment } from '@/lib/roles'
import { PRODUCTION_ORDER_STATUSES_REQUIRING_REASON, PRODUCTION_ORDER_TRANSITIONS } from '@/lib/statusTransitions'
import { StatusTransitionButtons } from '@/components/status/StatusTransitionButtons'

// The rest of the pipeline this Production Order will eventually drive --
// shown for orientation, not implemented. See docs/production-lifecycle.md;
// none of these stages exist yet, so this is deliberately just a static
// roadmap, never fake data or a fake status. "Material Requirement",
// "Material Allocation", "Schedule", "Execution" and "Quality control"
// are no longer here -- P3/P4/P5/P6/P7, implemented below.
const FUTURE_STAGES = ['Delivery']

const OVERALL_STATUS_LABEL: Record<MaterialRequirementSummary['overall_status'], string> = {
  not_calculated: 'Requirement not calculated',
  available: 'Materials available',
  short: 'Materials short',
}

const ALLOCATION_STATUS_LABEL: Record<MaterialRequirementSummary['allocation_status'], string> = {
  not_calculated: 'Requirement not calculated',
  not_allocated: 'Not allocated',
  partially_allocated: 'Partially allocated',
  fully_allocated: 'Fully allocated',
}

const SCHEDULE_STATUS_LABEL: Record<ProductionOrderScheduleSummary['schedule_status'], string> = {
  unscheduled: 'Unscheduled',
  scheduled: 'Scheduled',
  cancelled: 'Schedule cancelled',
}

const EXECUTION_STATUS_LABEL: Record<ProductionExecutionSummary['execution_status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  partially_completed: 'Partially completed',
  completed: 'Completed',
}

const FG_RELEASE_STATUS_LABEL: Record<
  Exclude<ProductionExecutionRun['fg_release_status'], 'not_applicable'>,
  string
> = {
  not_requested: 'QC not requested',
  pending: 'QC: report pending',
  partially_released: 'Partially released',
  released: 'Released',
  rejected: 'QC rejected',
}

const QC_STATUS_LABEL: Record<QcRequestStatus, string> = {
  requested: 'Requested',
  sample_sent: 'Sample sent — report pending',
  report_received: 'Report received — result pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function ProductionOrderDetailPage() {
  const { id } = useParams()
  const productionOrderId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const allowWrite = canWriteDepartment(user, 'sales')

  const [po, setPo] = useState<ProductionOrder | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [requirements, setRequirements] = useState<MaterialRequirementSummary | null>(null)
  const [schedules, setSchedules] = useState<ProductionOrderScheduleSummary | null>(null)
  const [executions, setExecutions] = useState<ProductionExecutionSummary | null>(null)
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [allocateQty, setAllocateQty] = useState<Record<number, string>>({})
  const [releaseQty, setReleaseQty] = useState<Record<number, string>>({})
  const [actionBusyId, setActionBusyId] = useState<number | null>(null)

  const [scheduleForm, setScheduleForm] = useState({ machineId: '', quantity: '', start: '', end: '' })
  const [schedulingBusy, setSchedulingBusy] = useState(false)
  const [cancelReasonById, setCancelReasonById] = useState<Record<number, string>>({})
  const [scheduleActionBusyId, setScheduleActionBusyId] = useState<number | null>(null)

  const [startScheduleId, setStartScheduleId] = useState('')
  const [startQuantity, setStartQuantity] = useState('')
  const [startBusy, setStartBusy] = useState(false)
  const [producedQtyById, setProducedQtyById] = useState<Record<number, string>>({})
  const [executionCancelReasonById, setExecutionCancelReasonById] = useState<Record<number, string>>({})
  const [executionActionBusyId, setExecutionActionBusyId] = useState<number | null>(null)

  const [qcAgents, setQcAgents] = useState<QcAgent[]>([])
  const [qcRequests, setQcRequests] = useState<QcRequest[]>([])
  const [qcForm, setQcForm] = useState({ executionId: '', agentId: '', quantity: '', sampleQuantity: '', expectedDate: '' })
  const [qcFormBusy, setQcFormBusy] = useState(false)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [newAgentForm, setNewAgentForm] = useState({ code: '', name: '' })
  const [newAgentBusy, setNewAgentBusy] = useState(false)
  const [sampleSentForm, setSampleSentForm] = useState<Record<number, { method: string; ref: string }>>({})
  const [reportForm, setReportForm] = useState<
    Record<number, { number: string; date: string; remarks: string; result: string }>
  >({})
  const [qcActionBusyId, setQcActionBusyId] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    getProductionOrder(productionOrderId)
      .then((result) => {
        setPo(result)
        return Promise.all([
          // Stock-only production order (P8) -- no customer order to load.
          result.order_id !== null ? getOrder(result.order_id) : Promise.resolve(null),
          getMaterialRequirements(productionOrderId),
          getProductionOrderSchedules(productionOrderId),
          getProductionExecutions(productionOrderId),
          listMachines({ status: 'active', page_size: 200 }),
          listQcAgents({ status: 'active', page_size: 200 }),
          listQcRequests({ production_order_id: productionOrderId, page_size: 200 }),
        ])
      })
      .then(
        ([
          orderResult,
          requirementsResult,
          scheduleResult,
          executionResult,
          machinesResult,
          qcAgentsResult,
          qcRequestsResult,
        ]) => {
          setOrder(orderResult)
          setRequirements(requirementsResult)
          setSchedules(scheduleResult)
          setExecutions(executionResult)
          setMachines(machinesResult.items)
          setQcAgents(qcAgentsResult.items)
          setQcRequests(qcRequestsResult.items)
        },
      )
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [productionOrderId])

  useEffect(load, [load])

  async function handleCalculate() {
    setCalculating(true)
    setError(null)
    try {
      const result = await calculateMaterialRequirements(productionOrderId)
      setRequirements(result)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setCalculating(false)
    }
  }

  async function handleStatusChange(status: (typeof PRODUCTION_ORDER_TRANSITIONS)['planned'][number], reason?: string) {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateProductionOrderStatus(productionOrderId, status, reason)
      setPo(updated)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleAllocate(requirementId: number) {
    const raw = allocateQty[requirementId]
    const quantity = Number(raw)
    if (!raw || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a quantity greater than zero to allocate.')
      return
    }
    setActionBusyId(requirementId)
    setError(null)
    try {
      const result = await allocateMaterial(productionOrderId, requirementId, quantity)
      setRequirements(result)
      setAllocateQty((prev) => ({ ...prev, [requirementId]: '' }))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  async function handleRelease(requirementId: number) {
    const raw = releaseQty[requirementId]
    const quantity = Number(raw)
    if (!raw || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a quantity greater than zero to release.')
      return
    }
    setActionBusyId(requirementId)
    setError(null)
    try {
      const result = await releaseMaterialAllocation(productionOrderId, requirementId, quantity)
      setRequirements(result)
      setReleaseQty((prev) => ({ ...prev, [requirementId]: '' }))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setActionBusyId(null)
    }
  }

  async function handleCreateSchedule() {
    if (!scheduleForm.start) {
      setError('Enter a planned start to create a schedule.')
      return
    }
    setSchedulingBusy(true)
    setError(null)
    try {
      const result = await createProductionOrderSchedule(productionOrderId, {
        machine_id: scheduleForm.machineId ? Number(scheduleForm.machineId) : undefined,
        planned_quantity: scheduleForm.quantity ? Number(scheduleForm.quantity) : undefined,
        planned_start: scheduleForm.start,
        planned_end: scheduleForm.end || undefined,
      })
      setSchedules(result)
      setScheduleForm({ machineId: '', quantity: '', start: '', end: '' })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSchedulingBusy(false)
    }
  }

  async function handleCancelSchedule(scheduleId: number) {
    const reason = cancelReasonById[scheduleId]
    if (!reason || !reason.trim()) {
      setError('Enter a reason to cancel this schedule.')
      return
    }
    setScheduleActionBusyId(scheduleId)
    setError(null)
    try {
      const result = await cancelProductionOrderSchedule(productionOrderId, scheduleId, reason)
      setSchedules(result)
      setCancelReasonById((prev) => ({ ...prev, [scheduleId]: '' }))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setScheduleActionBusyId(null)
    }
  }

  async function handleStartExecution() {
    if (!startScheduleId) {
      setError('Choose a schedule to start production against.')
      return
    }
    setStartBusy(true)
    setError(null)
    try {
      const result = await startProductionExecution(
        productionOrderId,
        Number(startScheduleId),
        startQuantity ? Number(startQuantity) : undefined,
      )
      setExecutions(result)
      setStartScheduleId('')
      setStartQuantity('')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setStartBusy(false)
    }
  }

  async function handleCompleteExecution(executionId: number) {
    const raw = producedQtyById[executionId]
    const quantity = Number(raw)
    if (!raw || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter the actual quantity produced to complete this run.')
      return
    }
    setExecutionActionBusyId(executionId)
    setError(null)
    try {
      const result = await completeProductionExecution(productionOrderId, executionId, quantity)
      setExecutions(result)
      setProducedQtyById((prev) => ({ ...prev, [executionId]: '' }))
      // Material allocation figures (consumed/remaining) may have changed.
      setRequirements(await getMaterialRequirements(productionOrderId))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setExecutionActionBusyId(null)
    }
  }

  async function handleCancelExecution(executionId: number) {
    const reason = executionCancelReasonById[executionId]
    if (!reason || !reason.trim()) {
      setError('Enter a reason to cancel this run.')
      return
    }
    setExecutionActionBusyId(executionId)
    setError(null)
    try {
      const result = await cancelProductionExecution(productionOrderId, executionId, reason)
      setExecutions(result)
      setExecutionCancelReasonById((prev) => ({ ...prev, [executionId]: '' }))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setExecutionActionBusyId(null)
    }
  }

  async function refreshQc() {
    const [qcRequestsResult, executionResult] = await Promise.all([
      listQcRequests({ production_order_id: productionOrderId, page_size: 200 }),
      getProductionExecutions(productionOrderId),
    ])
    setQcRequests(qcRequestsResult.items)
    setExecutions(executionResult)
  }

  async function handleCreateNewAgent() {
    if (!newAgentForm.code.trim() || !newAgentForm.name.trim()) {
      setError('Enter both a code and a name for the new QC agent.')
      return
    }
    setNewAgentBusy(true)
    setError(null)
    try {
      const agent = await createQcAgent({ code: newAgentForm.code, name: newAgentForm.name })
      setQcAgents((prev) => [...prev, agent])
      setQcForm((prev) => ({ ...prev, agentId: String(agent.id) }))
      setNewAgentForm({ code: '', name: '' })
      setShowNewAgent(false)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setNewAgentBusy(false)
    }
  }

  async function handleCreateQcRequest() {
    if (!qcForm.executionId || !qcForm.agentId) {
      setError('Choose a completed run and a QC agent to create a request.')
      return
    }
    setQcFormBusy(true)
    setError(null)
    try {
      await createQcRequest({
        production_order_id: productionOrderId,
        production_execution_id: Number(qcForm.executionId),
        qc_agent_id: Number(qcForm.agentId),
        quantity: qcForm.quantity ? Number(qcForm.quantity) : undefined,
        sample_quantity: qcForm.sampleQuantity ? Number(qcForm.sampleQuantity) : undefined,
        expected_report_date: qcForm.expectedDate || undefined,
      })
      await refreshQc()
      setQcForm({ executionId: '', agentId: '', quantity: '', sampleQuantity: '', expectedDate: '' })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setQcFormBusy(false)
    }
  }

  async function handleMarkSampleSent(requestId: number) {
    const form = sampleSentForm[requestId] ?? { method: '', ref: '' }
    setQcActionBusyId(requestId)
    setError(null)
    try {
      await markQcSampleSent(requestId, { dispatch_method: form.method || undefined, external_reference: form.ref || undefined })
      await refreshQc()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setQcActionBusyId(null)
    }
  }

  async function handleRecordReport(requestId: number) {
    const form = reportForm[requestId]
    if (!form || !form.number.trim() || !form.date) {
      setError('Enter a report number and date to record the report.')
      return
    }
    setQcActionBusyId(requestId)
    setError(null)
    try {
      await recordQcReport(requestId, {
        report_number: form.number,
        report_date: form.date,
        remarks: form.remarks || undefined,
        result: form.result === 'accepted' || form.result === 'rejected' ? form.result : undefined,
      })
      await refreshQc()
      setReportForm((prev) => ({ ...prev, [requestId]: { number: '', date: '', remarks: '', result: '' } }))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setQcActionBusyId(null)
    }
  }

  async function handleRecordResult(requestId: number, result: 'accepted' | 'rejected') {
    setQcActionBusyId(requestId)
    setError(null)
    try {
      await recordQcResult(requestId, { result })
      await refreshQc()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setQcActionBusyId(null)
    }
  }

  async function handleUploadReportDocument(requestId: number, file: File) {
    setQcActionBusyId(requestId)
    setError(null)
    try {
      await uploadQcReportDocument(requestId, file)
      await refreshQc()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setQcActionBusyId(null)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Spinner size={28} className="text-gold-300" />
        </div>
      </AppLayout>
    )
  }

  if (!po) {
    return (
      <AppLayout>
        <Alert variant="error">{error ?? 'Production order not found.'}</Alert>
      </AppLayout>
    )
  }

  const nextStatuses = PRODUCTION_ORDER_TRANSITIONS[po.status]

  const completedRunStatuses = executions?.runs.filter((r) => r.status === 'completed').map((r) => r.fg_release_status) ?? []
  const qcPipelineTone: 'success' | 'danger' | 'gold' | 'neutral' =
    completedRunStatuses.length === 0
      ? 'neutral'
      : completedRunStatuses.every((s) => s === 'released')
        ? 'success'
        : completedRunStatuses.some((s) => s === 'rejected')
          ? 'danger'
          : completedRunStatuses.some((s) => s === 'pending' || s === 'not_requested' || s === 'partially_released')
            ? 'gold'
            : 'neutral'

  return (
    <AppLayout>
      <PageHeader title={po.production_order_number} subtitle={po.customer_name ?? undefined} />

      <Alert variant="error">{error}</Alert>

      <GlassCard className="mb-6 p-8">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <StatusBadge status={po.status} />
          <Badge tone="neutral">{`${po.priority} priority`}</Badge>
          {allowWrite && nextStatuses.length > 0 && (
            <div className="ml-auto">
              <StatusTransitionButtons
                nextStatuses={nextStatuses}
                reasonRequiredFor={PRODUCTION_ORDER_STATUSES_REQUIRING_REASON}
                reasonLabel="Reason for cancelling"
                busy={busy}
                onChange={handleStatusChange}
              />
            </div>
          )}
        </div>

        <h2 className="mb-4 font-display text-base font-medium text-white">Order information</h2>
        {po.order_id !== null ? (
          <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field
              label="Customer order"
              value={
                <Link to={`/orders/${po.order_id}`} className="text-gold-300 hover:text-gold-200">
                  {po.order_number}
                </Link>
              }
            />
            <Field
              label="Customer"
              value={
                po.customer_id ? (
                  <Link to={`/customers/${po.customer_id}`} className="text-gold-300 hover:text-gold-200">
                    {po.customer_name ?? `#${po.customer_id}`}
                  </Link>
                ) : (
                  po.customer_name ?? '—'
                )
              }
            />
            <Field label="Order date" value={order ? formatDate(order.order_date) : '—'} />
            <Field label="Due date" value={formatDate(po.due_date)} />
          </dl>
        ) : (
          <p className="text-sm text-white/50">
            Stock production — built to replenish general Finished Goods inventory, not tied to a customer order.
          </p>
        )}

        <h2 className="mt-8 mb-4 font-display text-base font-medium text-white">Production information</h2>
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Field
            label="Product"
            value={
              <Link to={`/products/${po.product_id}`} className="text-gold-300 hover:text-gold-200">
                {po.product_code ? `${po.product_code} — ${po.product_name}` : `#${po.product_id}`}
              </Link>
            }
          />
          {po.order_id !== null && (
            <Field label="Ordered quantity" value={`${po.ordered_quantity ?? '—'} ${po.unit ?? ''}`} />
          )}
          <Field label="Planned production quantity" value={`${po.planned_quantity} ${po.unit ?? ''}`} />
          {po.order_id !== null && (
            <Field
              label="Remaining order quantity"
              value={po.remaining_order_quantity !== null ? `${po.remaining_order_quantity} ${po.unit ?? ''}` : '—'}
            />
          )}
          {po.order_id === null && <Field label="Due date" value={formatDate(po.due_date)} />}
        </dl>

        {po.status === 'cancelled' && po.cancel_reason && (
          <div className="mt-6">
            <Field label="Cancel reason" value={po.cancel_reason} />
          </div>
        )}
        {po.notes && (
          <div className="mt-6">
            <Field label="Notes" value={po.notes} />
          </div>
        )}
      </GlassCard>

      {executions && (
        <GlassCard className="mb-6 p-8">
          <h2 className="mb-4 font-display text-base font-medium text-white">Finished-goods quantities</h2>
          <dl className="grid grid-cols-2 gap-6 sm:grid-cols-6">
            <Field label="Planned" value={`${executions.planned_quantity} ${po.unit ?? ''}`} />
            <Field label="Produced" value={`${executions.total_produced} ${po.unit ?? ''}`} />
            <Field label="QC pending" value={`${executions.qc_pending} ${po.unit ?? ''}`} />
            <Field label="QC released" value={`${executions.qc_released} ${po.unit ?? ''}`} />
            <Field label="QC rejected" value={`${executions.qc_rejected} ${po.unit ?? ''}`} />
            <Field label="FG received" value={`${executions.qc_released} ${po.unit ?? ''}`} />
          </dl>
        </GlassCard>
      )}

      <GlassCard className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-medium text-white">Material requirements</h2>
            {requirements && (
              <Badge
                tone={
                  requirements.overall_status === 'available'
                    ? 'success'
                    : requirements.overall_status === 'short'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {OVERALL_STATUS_LABEL[requirements.overall_status]}
              </Badge>
            )}
            {requirements && requirements.items.length > 0 && (
              <Badge
                tone={
                  requirements.allocation_status === 'fully_allocated'
                    ? 'success'
                    : requirements.allocation_status === 'partially_allocated'
                      ? 'gold'
                      : 'neutral'
                }
              >
                {`Materials: ${ALLOCATION_STATUS_LABEL[requirements.allocation_status].toUpperCase()}${
                  requirements.allocation_status === 'partially_allocated'
                    ? ` — ${requirements.items
                        .reduce((sum, i) => sum + i.remaining_to_allocate, 0)
                        .toLocaleString()} remaining`
                    : ''
                }`}
              </Badge>
            )}
          </div>
          {allowWrite && po.status === 'planned' && (
            <Button size="sm" variant="ghost" isLoading={calculating} onClick={handleCalculate}>
              {requirements && requirements.items.length > 0 ? 'Recalculate' : 'Calculate requirements'}
            </Button>
          )}
        </div>
        {!requirements || requirements.items.length === 0 ? (
          <EmptyState
            title="Requirement not calculated"
            message={
              po.status === 'planned'
                ? "Calculate this production order's material requirement from its product's BOM and packaging."
                : 'No material requirement was calculated before this production order left planning.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Material</th>
                  <th className="px-6 py-4 text-right font-medium">Required</th>
                  <th className="px-6 py-4 text-right font-medium">Available</th>
                  <th className="px-6 py-4 text-right font-medium">Allocated</th>
                  <th className="px-6 py-4 text-right font-medium">Remaining</th>
                  <th className="px-6 py-4 text-right font-medium">Shortage</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  {allowWrite && <th className="px-6 py-4 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requirements.items.map((item) => {
                  const itemAllocationStatus: MaterialRequirementSummary['allocation_status'] =
                    item.remaining_to_allocate <= 0
                      ? 'fully_allocated'
                      : item.allocated_quantity > 0
                        ? 'partially_allocated'
                        : 'not_allocated'
                  const maxAllocatable = Math.max(
                    Math.min(item.remaining_to_allocate, item.available_quantity),
                    0,
                  )
                  return (
                    <tr key={item.id} className="border-b border-white/5 last:border-0 align-top">
                      <td className="px-6 py-4 text-white">
                        <Link to={`/raw-materials/${item.raw_material_id}`} className="text-gold-300 hover:text-gold-200">
                          {item.code} — {item.name}
                        </Link>
                        <div className="mt-1 text-xs text-white/40">{item.material_type_label}</div>
                      </td>
                      <td className="px-6 py-4 text-right text-white/60">{item.required_quantity}</td>
                      <td className="px-6 py-4 text-right text-white/60">{item.available_quantity}</td>
                      <td className="px-6 py-4 text-right text-white/60">
                        {item.allocated_quantity}
                        {item.consumed_quantity > 0 && (
                          <div className="mt-1 text-xs text-white/40">{`${item.consumed_quantity} consumed`}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-white/60">{item.remaining_to_allocate}</td>
                      <td className="px-6 py-4 text-right">
                        {item.shortage_quantity > 0 ? (
                          <span className="text-red-300">{item.shortage_quantity}</span>
                        ) : (
                          <span className="text-white/40">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          tone={
                            itemAllocationStatus === 'fully_allocated'
                              ? 'success'
                              : itemAllocationStatus === 'partially_allocated'
                                ? 'gold'
                                : 'neutral'
                          }
                        >
                          {ALLOCATION_STATUS_LABEL[itemAllocationStatus]}
                        </Badge>
                      </td>
                      {allowWrite && (
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            {po.status === 'planned' && maxAllocatable > 0 && (
                              <div className="flex items-end gap-2">
                                <div className="w-28">
                                  <TextField
                                    label="Allocate"
                                    type="number"
                                    min={0}
                                    max={maxAllocatable}
                                    step="any"
                                    placeholder={`${maxAllocatable}`}
                                    value={allocateQty[item.id] ?? ''}
                                    onChange={(e) =>
                                      setAllocateQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                                    }
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  isLoading={actionBusyId === item.id}
                                  onClick={() => handleAllocate(item.id)}
                                >
                                  Allocate
                                </Button>
                              </div>
                            )}
                            {item.remaining_allocated > 0 && (
                              <div className="flex items-end gap-2">
                                <div className="w-28">
                                  <TextField
                                    label="Release"
                                    type="number"
                                    min={0}
                                    max={item.remaining_allocated}
                                    step="any"
                                    placeholder={`${item.remaining_allocated}`}
                                    value={releaseQty[item.id] ?? ''}
                                    onChange={(e) =>
                                      setReleaseQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                                    }
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  isLoading={actionBusyId === item.id}
                                  onClick={() => handleRelease(item.id)}
                                >
                                  Release
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {requirements && requirements.calculated_at && (
          <p className="border-t border-white/10 px-6 py-3 text-xs text-white/40">
            Last calculated {formatDateTime(requirements.calculated_at)} against {requirements.items.find((i) => i.bom_number)?.bom_number ?? 'the active BOM'}.
          </p>
        )}
      </GlassCard>

      <GlassCard className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-medium text-white">Production schedule</h2>
            {schedules && (
              <Badge
                tone={
                  schedules.schedule_status === 'scheduled'
                    ? 'success'
                    : schedules.schedule_status === 'cancelled'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {schedules.schedule_status === 'scheduled'
                  ? schedules.remaining_to_schedule > 0
                    ? `Scheduled -- ${schedules.remaining_to_schedule} ${po.unit ?? ''} remaining`
                    : 'Fully scheduled'
                  : SCHEDULE_STATUS_LABEL[schedules.schedule_status]}
              </Badge>
            )}
          </div>
        </div>

        {schedules && schedules.schedules.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Machine</th>
                  <th className="px-6 py-4 text-right font-medium">Qty</th>
                  <th className="px-6 py-4 font-medium">Start</th>
                  <th className="px-6 py-4 font-medium">End</th>
                  <th className="px-6 py-4 font-medium">Due date</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  {allowWrite && <th className="px-6 py-4 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {schedules.schedules.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 last:border-0 align-top">
                    <td className="px-6 py-4 text-white">{s.machine_name ?? '—'}</td>
                    <td className="px-6 py-4 text-right text-white/60">{s.planned_quantity}</td>
                    <td className="px-6 py-4 text-white/60">{formatDateTime(s.planned_start ?? s.scheduled_start)}</td>
                    <td className="px-6 py-4 text-white/60">{formatDateTime(s.planned_end ?? s.scheduled_end)}</td>
                    <td className="px-6 py-4">
                      {s.status === 'cancelled' ? (
                        <span className="text-white/40">—</span>
                      ) : s.due_date_status === 'after_due' ? (
                        <span className="text-red-300">Past due date</span>
                      ) : (
                        <span className="text-emerald-300">On time</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={s.status} />
                    </td>
                    {allowWrite && (
                      <td className="px-6 py-4">
                        {s.status === 'planned' && (
                          <div className="flex items-end gap-2">
                            <div className="w-40">
                              <TextField
                                label="Cancel reason"
                                value={cancelReasonById[s.id] ?? ''}
                                onChange={(e) =>
                                  setCancelReasonById((prev) => ({ ...prev, [s.id]: e.target.value }))
                                }
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              isLoading={scheduleActionBusyId === s.id}
                              onClick={() => handleCancelSchedule(s.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(!schedules || schedules.schedules.length === 0) && (
          <EmptyState
            title="Not scheduled"
            message="This production order hasn't been booked onto the machine calendar yet."
          />
        )}

        {allowWrite && po.status === 'planned' && schedules && schedules.remaining_to_schedule > 0 && (
          <div className="border-t border-white/10 px-6 py-5">
            <h3 className="mb-4 text-sm font-medium text-white">Schedule remaining {schedules.remaining_to_schedule} {po.unit ?? ''}</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <SelectField
                  label="Machine"
                  value={scheduleForm.machineId}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, machineId: e.target.value }))}
                >
                  <option value="">Product's default machine</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="w-32">
                <TextField
                  label="Quantity"
                  type="number"
                  min={0}
                  max={schedules.remaining_to_schedule}
                  step="any"
                  placeholder={`${schedules.remaining_to_schedule}`}
                  value={scheduleForm.quantity}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, quantity: e.target.value }))}
                />
              </div>
              <div className="w-52">
                <TextField
                  label="Planned start"
                  type="datetime-local"
                  value={scheduleForm.start}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <div className="w-52">
                <TextField
                  label="Planned end (optional)"
                  hint="Left blank, it's computed from the product's production rate."
                  type="datetime-local"
                  value={scheduleForm.end}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, end: e.target.value }))}
                />
              </div>
              <Button isLoading={schedulingBusy} onClick={handleCreateSchedule}>
                Schedule
              </Button>
            </div>
          </div>
        )}
      </GlassCard>

      <GlassCard className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-medium text-white">Production execution</h2>
            {executions && (
              <Badge
                tone={
                  executions.execution_status === 'completed'
                    ? 'success'
                    : executions.execution_status === 'in_progress' || executions.execution_status === 'partially_completed'
                      ? 'gold'
                      : 'neutral'
                }
              >
                {`${EXECUTION_STATUS_LABEL[executions.execution_status]} -- ${executions.total_produced} / ${executions.planned_quantity} ${po.unit ?? ''} produced`}
              </Badge>
            )}
          </div>
        </div>

        {executions && executions.runs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Run</th>
                  <th className="px-6 py-4 font-medium">Machine</th>
                  <th className="px-6 py-4 text-right font-medium">Planned</th>
                  <th className="px-6 py-4 text-right font-medium">Actual</th>
                  <th className="px-6 py-4 font-medium">Start</th>
                  <th className="px-6 py-4 font-medium">End</th>
                  <th className="px-6 py-4 font-medium">Duration</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">FG Release</th>
                  {allowWrite && <th className="px-6 py-4 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {executions.runs.map((run, index) => (
                  <tr key={run.id} className="border-b border-white/5 last:border-0 align-top">
                    <td className="px-6 py-4 text-white">#{index + 1}</td>
                    <td className="px-6 py-4 text-white/60">{run.machine_name ?? '—'}</td>
                    <td className="px-6 py-4 text-right text-white/60">{run.planned_quantity}</td>
                    <td className="px-6 py-4 text-right text-white/60">
                      {run.status === 'in_progress' ? '—' : run.produced_quantity}
                    </td>
                    <td className="px-6 py-4 text-white/60">{formatDateTime(run.started_at)}</td>
                    <td className="px-6 py-4 text-white/60">{formatDateTime(run.ended_at)}</td>
                    <td className="px-6 py-4 text-white/60">{formatDuration(run.duration_seconds)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-6 py-4">
                      {run.fg_release_status === 'not_applicable' ? (
                        <span className="text-white/40">—</span>
                      ) : (
                        <Badge
                          tone={
                            run.fg_release_status === 'released'
                              ? 'success'
                              : run.fg_release_status === 'rejected'
                                ? 'danger'
                                : run.fg_release_status === 'pending'
                                  ? 'gold'
                                  : 'neutral'
                          }
                        >
                          {FG_RELEASE_STATUS_LABEL[run.fg_release_status]}
                        </Badge>
                      )}
                    </td>
                    {allowWrite && (
                      <td className="px-6 py-4">
                        {run.status === 'in_progress' && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-end gap-2">
                              <div className="w-28">
                                <TextField
                                  label="Actual qty"
                                  type="number"
                                  min={0}
                                  step="any"
                                  placeholder={`${run.planned_quantity}`}
                                  value={producedQtyById[run.id] ?? ''}
                                  onChange={(e) =>
                                    setProducedQtyById((prev) => ({ ...prev, [run.id]: e.target.value }))
                                  }
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                isLoading={executionActionBusyId === run.id}
                                onClick={() => handleCompleteExecution(run.id)}
                              >
                                Complete
                              </Button>
                            </div>
                            <div className="flex items-end gap-2">
                              <div className="w-40">
                                <TextField
                                  label="Cancel reason"
                                  value={executionCancelReasonById[run.id] ?? ''}
                                  onChange={(e) =>
                                    setExecutionCancelReasonById((prev) => ({ ...prev, [run.id]: e.target.value }))
                                  }
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                isLoading={executionActionBusyId === run.id}
                                onClick={() => handleCancelExecution(run.id)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(!executions || executions.runs.length === 0) && (
          <EmptyState title="Not started" message="No production has been started against this production order yet." />
        )}

        {allowWrite &&
          schedules &&
          schedules.schedules.some(
            (s) => s.status === 'planned' && !executions?.runs.some((r) => r.schedule_id === s.id && r.status === 'in_progress'),
          ) &&
          executions &&
          executions.remaining_to_produce > 0 && (
            <div className="border-t border-white/10 px-6 py-5">
              <h3 className="mb-4 text-sm font-medium text-white">Start production</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                  <SelectField
                    label="Schedule"
                    value={startScheduleId}
                    onChange={(e) => setStartScheduleId(e.target.value)}
                  >
                    <option value="">Choose a schedule</option>
                    {schedules.schedules
                      .filter(
                        (s) =>
                          s.status === 'planned' &&
                          !executions.runs.some((r) => r.schedule_id === s.id && r.status === 'in_progress'),
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.machine_name ?? 'Machine'} — {formatDateTime(s.planned_start ?? s.scheduled_start)}
                        </option>
                      ))}
                  </SelectField>
                </div>
                <div className="w-32">
                  <TextField
                    label="Planned qty"
                    type="number"
                    min={0}
                    max={executions.remaining_to_produce}
                    step="any"
                    placeholder={`${executions.remaining_to_produce}`}
                    value={startQuantity}
                    onChange={(e) => setStartQuantity(e.target.value)}
                  />
                </div>
                <Button isLoading={startBusy} onClick={handleStartExecution}>
                  Start production
                </Button>
              </div>
            </div>
          )}
      </GlassCard>

      <GlassCard className="mb-6 overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-white">Quality control</h2>
          <p className="mt-1 text-xs text-white/40">
            Testing is performed by an external laboratory/agent -- JDK only tracks the request, sample dispatch,
            report, and result.
          </p>
        </div>

        {qcRequests.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs tracking-wide text-white/40 uppercase">
                  <th className="px-6 py-4 font-medium">Sample</th>
                  <th className="px-6 py-4 font-medium">External agent</th>
                  <th className="px-6 py-4 font-medium">Sent</th>
                  <th className="px-6 py-4 font-medium">Report</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  {allowWrite && <th className="px-6 py-4 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {qcRequests.map((request) => {
                  const runIndex = executions?.runs.findIndex((r) => r.id === request.production_execution_id) ?? -1
                  return (
                    <tr key={request.id} className="border-b border-white/5 last:border-0 align-top">
                      <td className="px-6 py-4 text-white">
                        {request.sample_reference}
                        <div className="mt-1 text-xs text-white/40">
                          {runIndex >= 0 ? `Run #${runIndex + 1}` : `Execution #${request.production_execution_id}`}
                          {` — deciding ${request.quantity}`}
                          {request.sample_quantity ? ` (${request.sample_quantity} sampled)` : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white/60">{request.qc_agent_name ?? '—'}</td>
                      <td className="px-6 py-4 text-white/60">{formatDate(request.dispatch_date)}</td>
                      <td className="px-6 py-4 text-white/60">
                        {request.report_number ? (
                          <>
                            {request.report_number}
                            <div className="mt-1 text-xs text-white/40">{formatDate(request.report_date)}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          tone={
                            request.status === 'accepted'
                              ? 'success'
                              : request.status === 'rejected'
                                ? 'danger'
                                : 'gold'
                          }
                        >
                          {QC_STATUS_LABEL[request.status]}
                        </Badge>
                      </td>
                      {allowWrite && (
                        <td className="px-6 py-4">
                          {request.status === 'requested' && (
                            <div className="flex flex-col gap-2">
                              <div className="w-40">
                                <TextField
                                  label="Dispatch method"
                                  value={sampleSentForm[request.id]?.method ?? ''}
                                  onChange={(e) =>
                                    setSampleSentForm((prev) => ({
                                      ...prev,
                                      [request.id]: { ...(prev[request.id] ?? { method: '', ref: '' }), method: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="w-32">
                                  <TextField
                                    label="Reference"
                                    value={sampleSentForm[request.id]?.ref ?? ''}
                                    onChange={(e) =>
                                      setSampleSentForm((prev) => ({
                                        ...prev,
                                        [request.id]: { ...(prev[request.id] ?? { method: '', ref: '' }), ref: e.target.value },
                                      }))
                                    }
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  isLoading={qcActionBusyId === request.id}
                                  onClick={() => handleMarkSampleSent(request.id)}
                                >
                                  Mark sent
                                </Button>
                              </div>
                            </div>
                          )}
                          {request.status === 'sample_sent' && (
                            <div className="flex flex-col gap-2">
                              <div className="w-36">
                                <TextField
                                  label="Report #"
                                  value={reportForm[request.id]?.number ?? ''}
                                  onChange={(e) =>
                                    setReportForm((prev) => ({
                                      ...prev,
                                      [request.id]: {
                                        ...(prev[request.id] ?? { number: '', date: '', remarks: '', result: '' }),
                                        number: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="w-36">
                                <TextField
                                  label="Report date"
                                  type="date"
                                  value={reportForm[request.id]?.date ?? ''}
                                  onChange={(e) =>
                                    setReportForm((prev) => ({
                                      ...prev,
                                      [request.id]: {
                                        ...(prev[request.id] ?? { number: '', date: '', remarks: '', result: '' }),
                                        date: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="w-44">
                                <SelectField
                                  label="Result"
                                  value={reportForm[request.id]?.result ?? ''}
                                  onChange={(e) =>
                                    setReportForm((prev) => ({
                                      ...prev,
                                      [request.id]: {
                                        ...(prev[request.id] ?? { number: '', date: '', remarks: '', result: '' }),
                                        result: e.target.value,
                                      },
                                    }))
                                  }
                                >
                                  <option value="">Not stated yet</option>
                                  <option value="accepted">Accepted</option>
                                  <option value="rejected">Rejected</option>
                                </SelectField>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                isLoading={qcActionBusyId === request.id}
                                onClick={() => handleRecordReport(request.id)}
                              >
                                Record report
                              </Button>
                            </div>
                          )}
                          {request.status === 'report_received' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                isLoading={qcActionBusyId === request.id}
                                onClick={() => handleRecordResult(request.id, 'accepted')}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                isLoading={qcActionBusyId === request.id}
                                onClick={() => handleRecordResult(request.id, 'rejected')}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                          {(request.status === 'sample_sent' ||
                            request.status === 'report_received' ||
                            request.status === 'accepted' ||
                            request.status === 'rejected') && (
                            <div className="mt-2">
                              {request.has_report_document ? (
                                <span className="text-xs text-white/40">Report attached</span>
                              ) : (
                                <label className="cursor-pointer text-xs text-gold-300 hover:text-gold-200">
                                  Attach report
                                  <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) void handleUploadReportDocument(request.id, file)
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {qcRequests.length === 0 && (
          <EmptyState
            title="No QC requests yet"
            message="Create a request once a run has completed to track its external testing."
          />
        )}

        {allowWrite && executions && executions.runs.some((r) => r.status === 'completed') && (
          <div className="border-t border-white/10 px-6 py-5">
            <h3 className="mb-4 text-sm font-medium text-white">Create QC request</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <SelectField
                  label="Run"
                  value={qcForm.executionId}
                  onChange={(e) => setQcForm((prev) => ({ ...prev, executionId: e.target.value }))}
                >
                  <option value="">Choose a completed run</option>
                  {executions.runs
                    .map((r, i) => ({ ...r, index: i }))
                    .filter((r) => r.status === 'completed')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {`Run #${r.index + 1} — ${r.produced_quantity} ${po.unit ?? ''}`}
                      </option>
                    ))}
                </SelectField>
              </div>
              <div className="w-48">
                <SelectField
                  label="QC agent"
                  value={qcForm.agentId}
                  onChange={(e) => setQcForm((prev) => ({ ...prev, agentId: e.target.value }))}
                >
                  <option value="">Choose an agent</option>
                  {qcAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="w-36">
                <TextField
                  label="Quantity to decide"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="All undecided"
                  value={qcForm.quantity}
                  onChange={(e) => setQcForm((prev) => ({ ...prev, quantity: e.target.value }))}
                />
              </div>
              <div className="w-32">
                <TextField
                  label="Sample qty"
                  type="number"
                  min={0}
                  step="any"
                  value={qcForm.sampleQuantity}
                  onChange={(e) => setQcForm((prev) => ({ ...prev, sampleQuantity: e.target.value }))}
                />
              </div>
              <div className="w-40">
                <TextField
                  label="Expected report date"
                  type="date"
                  value={qcForm.expectedDate}
                  onChange={(e) => setQcForm((prev) => ({ ...prev, expectedDate: e.target.value }))}
                />
              </div>
              <Button isLoading={qcFormBusy} onClick={handleCreateQcRequest}>
                Create request
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewAgent((v) => !v)}>
                {showNewAgent ? 'Cancel' : '+ New agent'}
              </Button>
            </div>
            {showNewAgent && (
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
                <div className="w-32">
                  <TextField
                    label="Agent code"
                    value={newAgentForm.code}
                    onChange={(e) => setNewAgentForm((prev) => ({ ...prev, code: e.target.value }))}
                  />
                </div>
                <div className="w-52">
                  <TextField
                    label="Agent name"
                    value={newAgentForm.name}
                    onChange={(e) => setNewAgentForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <Button size="sm" isLoading={newAgentBusy} onClick={handleCreateNewAgent}>
                  Save agent
                </Button>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      <GlassCard className="mb-6 overflow-hidden">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-lg font-medium text-white">Production pipeline</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-5">
          <Badge tone={po.status === 'cancelled' ? 'danger' : 'gold'}>Production order</Badge>
          <span className="flex items-center gap-3">
            <span className="text-white/20">→</span>
            <Badge
              tone={
                requirements?.overall_status === 'available'
                  ? 'success'
                  : requirements?.overall_status === 'short'
                    ? 'danger'
                    : 'neutral'
              }
            >
              Material requirement
            </Badge>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-white/20">→</span>
            <Badge
              tone={
                requirements?.allocation_status === 'fully_allocated'
                  ? 'success'
                  : requirements?.allocation_status === 'partially_allocated'
                    ? 'gold'
                    : 'neutral'
              }
            >
              Material allocation
            </Badge>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-white/20">→</span>
            <Badge
              tone={
                schedules?.schedule_status === 'scheduled'
                  ? 'success'
                  : schedules?.schedule_status === 'cancelled'
                    ? 'danger'
                    : 'neutral'
              }
            >
              Schedule
            </Badge>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-white/20">→</span>
            <Badge
              tone={
                executions?.execution_status === 'completed'
                  ? 'success'
                  : executions?.execution_status === 'in_progress' || executions?.execution_status === 'partially_completed'
                    ? 'gold'
                    : 'neutral'
              }
            >
              Execution
            </Badge>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-white/20">→</span>
            <Badge tone={qcPipelineTone}>Quality control</Badge>
          </span>
          <span className="flex items-center gap-3">
            <span className="text-white/20">→</span>
            {executions && executions.qc_released > 0 ? (
              <Link to={`/products/${po.product_id}`}>
                <Badge tone="success">Finished goods</Badge>
              </Link>
            ) : (
              <Badge tone="neutral">Finished goods</Badge>
            )}
          </span>
          {FUTURE_STAGES.map((stage) => (
            <span key={stage} className="flex items-center gap-3">
              <span className="text-white/20">→</span>
              <Badge tone="neutral">{stage}</Badge>
            </span>
          ))}
        </div>
        <p className="border-t border-white/10 px-6 py-3 text-xs text-white/40">
          Later stages aren't implemented yet -- see docs/production-lifecycle.md.
        </p>
      </GlassCard>

      <div className="mb-6">
        <HistoryTimeline resourcePath="/api/production-orders" id={productionOrderId} />
      </div>

      <button type="button" onClick={() => navigate(-1)} className="text-sm text-white/50 hover:text-white">
        ← Back
      </button>
    </AppLayout>
  )
}
