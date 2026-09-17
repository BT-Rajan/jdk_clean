/** Mirrors backend/app/schemas/production_order_material.py. */

export type MaterialRequirementOverallStatus = 'not_calculated' | 'available' | 'short'
export type MaterialAllocationStatus = 'not_calculated' | 'not_allocated' | 'partially_allocated' | 'fully_allocated'

export interface MaterialRequirementItem {
  id: number
  raw_material_id: number
  code: string
  name: string
  unit: string
  /** Mirrors RawMaterial.material_type -- the existing classification,
   * not a new taxonomy. */
  material_type: 'raw_material' | 'packaging' | 'consumable'
  material_type_label: string
  source: 'bom' | 'packaging'
  bom_id: number | null
  bom_number: string | null
  required_quantity: number
  /** Computed live from inventory at read time -- not stored. */
  available_quantity: number
  /** Persisted -- how much of this row is committed to this Production
   * Order (P4). See api/productionOrders.ts's allocateMaterial. */
  allocated_quantity: number
  remaining_to_allocate: number
  shortage_quantity: number
  /** Persisted -- how much of allocated_quantity has actually been
   * issued to production (P6). See productionOrderExecution.ts. */
  consumed_quantity: number
  /** allocated_quantity - consumed_quantity -- what can still be
   * released back to allocatable stock. */
  remaining_allocated: number
}

export interface MaterialRequirementSummary {
  production_order_id: number
  /** Whether enough stock exists at all -- independent of allocation_status. */
  overall_status: MaterialRequirementOverallStatus
  /** Whether that stock has actually been committed to this Production
   * Order yet -- a material-readiness signal, not the Production
   * Order's own PLANNED/CANCELLED status (see P2). */
  allocation_status: MaterialAllocationStatus
  calculated_at: string | null
  items: MaterialRequirementItem[]
}
