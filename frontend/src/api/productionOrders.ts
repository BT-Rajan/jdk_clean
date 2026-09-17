import type { PagedResponse, ListQueryParams } from '@/types/common'
import type { ProductionOrder, ProductionOrderPayload, SettableProductionOrderStatus } from '@/types/productionOrder'
import type { MaterialRequirementSummary } from '@/types/materialRequirement'
import type {
  ProductionOrderScheduleCreatePayload,
  ProductionOrderScheduleSummary,
  ProductionOrderScheduleUpdatePayload,
} from '@/types/productionOrderSchedule'
import type { ProductionExecutionSummary } from '@/types/productionOrderExecution'
import { apiClient } from './client'

export interface ProductionOrderListParams extends ListQueryParams {
  order_id?: number
  order_detail_id?: number
  product_id?: number
}

export async function listProductionOrders(
  params: ProductionOrderListParams,
): Promise<PagedResponse<ProductionOrder>> {
  const { data } = await apiClient.get<PagedResponse<ProductionOrder>>('/api/production-orders', { params })
  return data
}

export async function getProductionOrder(id: number): Promise<ProductionOrder> {
  const { data } = await apiClient.get<ProductionOrder>(`/api/production-orders/${id}`)
  return data
}

export async function createProductionOrder(payload: ProductionOrderPayload): Promise<ProductionOrder> {
  const { data } = await apiClient.post<ProductionOrder>('/api/production-orders', payload)
  return data
}

export async function updateProductionOrderStatus(
  id: number,
  status: SettableProductionOrderStatus,
  reason?: string,
): Promise<ProductionOrder> {
  const { data } = await apiClient.post<ProductionOrder>(`/api/production-orders/${id}/status`, { status, reason })
  return data
}

export async function getMaterialRequirements(productionOrderId: number): Promise<MaterialRequirementSummary> {
  const { data } = await apiClient.get<MaterialRequirementSummary>(
    `/api/production-orders/${productionOrderId}/material-requirements`,
  )
  return data
}

/** Recalculates from the product's current active BOM/packaging --
 * idempotent, safe to call repeatedly. Only allowed while the
 * production order is still 'planned' (see
 * backend/app/services/production_order_material_service.py). */
export async function calculateMaterialRequirements(productionOrderId: number): Promise<MaterialRequirementSummary> {
  const { data } = await apiClient.post<MaterialRequirementSummary>(
    `/api/production-orders/${productionOrderId}/material-requirements/calculate`,
  )
  return data
}

/** Commits up to `quantity` of currently available stock to this
 * requirement row -- never more than what's required, never more than
 * what's available, never against a cancelled production order. Never
 * touches physical on-hand stock, only the shared reservation ledger
 * (see backend/app/services/inventory_service.py's
 * reserve_stock_within_available). */
export async function allocateMaterial(
  productionOrderId: number,
  requirementId: number,
  quantity: number,
): Promise<MaterialRequirementSummary> {
  const { data } = await apiClient.post<MaterialRequirementSummary>(
    `/api/production-orders/${productionOrderId}/material-requirements/${requirementId}/allocate`,
    { quantity },
  )
  return data
}

/** Reverses part or all of a prior allocation, returning the quantity to
 * allocatable stock. Allowed even after the production order is
 * cancelled, since cancellation itself never touches allocations -- see
 * backend/app/services/production_order_material_service.py's release. */
export async function releaseMaterialAllocation(
  productionOrderId: number,
  requirementId: number,
  quantity: number,
): Promise<MaterialRequirementSummary> {
  const { data } = await apiClient.post<MaterialRequirementSummary>(
    `/api/production-orders/${productionOrderId}/material-requirements/${requirementId}/release`,
    { quantity },
  )
  return data
}

export async function getProductionOrderSchedules(productionOrderId: number): Promise<ProductionOrderScheduleSummary> {
  const { data } = await apiClient.get<ProductionOrderScheduleSummary>(
    `/api/production-orders/${productionOrderId}/schedules`,
  )
  return data
}

/** Books a machine slot for (some or all of) this Production Order's
 * planned quantity -- never gated on material allocation (see
 * backend/app/services/production_order_schedule_service.py's
 * create_schedule docstring); the material-readiness figures stay
 * visible alongside the schedule instead so the decision is informed,
 * not blocked. */
export async function createProductionOrderSchedule(
  productionOrderId: number,
  payload: ProductionOrderScheduleCreatePayload,
): Promise<ProductionOrderScheduleSummary> {
  const { data } = await apiClient.post<ProductionOrderScheduleSummary>(
    `/api/production-orders/${productionOrderId}/schedules`,
    payload,
  )
  return data
}

export async function updateProductionOrderSchedule(
  productionOrderId: number,
  scheduleId: number,
  payload: ProductionOrderScheduleUpdatePayload,
): Promise<ProductionOrderScheduleSummary> {
  const { data } = await apiClient.put<ProductionOrderScheduleSummary>(
    `/api/production-orders/${productionOrderId}/schedules/${scheduleId}`,
    payload,
  )
  return data
}

export async function cancelProductionOrderSchedule(
  productionOrderId: number,
  scheduleId: number,
  reason: string,
): Promise<ProductionOrderScheduleSummary> {
  const { data } = await apiClient.post<ProductionOrderScheduleSummary>(
    `/api/production-orders/${productionOrderId}/schedules/${scheduleId}/cancel`,
    { reason },
  )
  return data
}

export async function getProductionExecutions(productionOrderId: number): Promise<ProductionExecutionSummary> {
  const { data } = await apiClient.get<ProductionExecutionSummary>(
    `/api/production-orders/${productionOrderId}/executions`,
  )
  return data
}

/** Starts one manufacturing run against a scheduled slot -- never
 * touches inventory (see backend/app/services/production_execution_service.py's
 * start_execution). Server records the Kuwait start time; the browser
 * never authors it. */
export async function startProductionExecution(
  productionOrderId: number,
  scheduleId: number,
  plannedQuantity?: number,
): Promise<ProductionExecutionSummary> {
  const { data } = await apiClient.post<ProductionExecutionSummary>(
    `/api/production-orders/${productionOrderId}/executions`,
    { schedule_id: scheduleId, planned_quantity: plannedQuantity },
  )
  return data
}

/** Closes out a run with the actual quantity produced -- consumes the
 * BOM-scaled raw materials from whatever's allocated to this production
 * order (P4) and locks the run against further changes. */
export async function completeProductionExecution(
  productionOrderId: number,
  executionId: number,
  producedQuantity: number,
): Promise<ProductionExecutionSummary> {
  const { data } = await apiClient.post<ProductionExecutionSummary>(
    `/api/production-orders/${productionOrderId}/executions/${executionId}/complete`,
    { produced_quantity: producedQuantity },
  )
  return data
}

export async function cancelProductionExecution(
  productionOrderId: number,
  executionId: number,
  reason: string,
): Promise<ProductionExecutionSummary> {
  const { data } = await apiClient.post<ProductionExecutionSummary>(
    `/api/production-orders/${productionOrderId}/executions/${executionId}/cancel`,
    { reason },
  )
  return data
}
