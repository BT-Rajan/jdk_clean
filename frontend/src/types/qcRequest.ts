/** Mirrors backend/app/schemas/qc_request.py. */

export type QcRequestStatus = 'requested' | 'sample_sent' | 'report_received' | 'accepted' | 'rejected'

export interface QcRequest {
  id: number
  qc_request_number: string
  production_order_id: number
  production_order_number: string | null
  production_execution_id: number
  product_id: number
  product_code: string | null
  product_name: string | null
  qc_agent_id: number
  qc_agent_name: string | null
  sample_reference: string
  /** How much of the execution's produced_quantity this request
   * decides (P8) -- distinct from sample_quantity below (the much
   * smaller physical sample sent to the lab). */
  quantity: number
  sample_quantity: number | null
  request_date: string
  expected_report_date: string | null
  status: QcRequestStatus
  dispatch_date: string | null
  dispatch_method: string | null
  external_reference: string | null
  dispatched_by: number | null
  report_number: string | null
  report_date: string | null
  received_date: string | null
  decided_date: string | null
  decided_by: number | null
  notes: string | null
  has_report_document: boolean
  admin_review_required: boolean
  admin_reviewed_at: string | null
  admin_review_notes: string | null
  created_at: string
  updated_at: string
}

export interface QcRequestCreatePayload {
  production_order_id: number
  production_execution_id: number
  qc_agent_id: number
  /** Omit to default to whatever's still undecided on the execution --
   * give it explicitly to split one execution's output across more
   * than one QC request (P8). */
  quantity?: number | null
  sample_quantity?: number | null
  expected_report_date?: string | null
  notes?: string | null
}

export interface QcSampleSentPayload {
  dispatch_method?: string | null
  external_reference?: string | null
}

export interface QcReportPayload {
  report_number: string
  report_date: string
  remarks?: string | null
  result?: 'accepted' | 'rejected' | null
}

export interface QcResultPayload {
  result: 'accepted' | 'rejected'
}
