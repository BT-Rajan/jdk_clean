/** Mirrors backend/app/schemas/reconciliation.py. */

export interface ReconciliationException {
  area: string
  document: string
  product_or_material: string
  expected: number
  actual: number
  difference: number
  status: string
  kind: string
}
