import type { PagedResponse } from '@/types/common'
import type {
  QcReportPayload,
  QcRequest,
  QcRequestCreatePayload,
  QcResultPayload,
  QcSampleSentPayload,
} from '@/types/qcRequest'
import { apiClient } from './client'

export interface QcRequestListParams {
  production_order_id?: number
  production_execution_id?: number
  qc_agent_id?: number
  status?: string
  page?: number
  page_size?: number
}

export async function listQcRequests(params: QcRequestListParams): Promise<PagedResponse<QcRequest>> {
  const { data } = await apiClient.get<PagedResponse<QcRequest>>('/api/qc-requests', { params })
  return data
}

export async function createQcRequest(payload: QcRequestCreatePayload): Promise<QcRequest> {
  const { data } = await apiClient.post<QcRequest>('/api/qc-requests', payload)
  return data
}

export async function markQcSampleSent(qcRequestId: number, payload: QcSampleSentPayload): Promise<QcRequest> {
  const { data } = await apiClient.post<QcRequest>(`/api/qc-requests/${qcRequestId}/sample-sent`, payload)
  return data
}

export async function recordQcReport(qcRequestId: number, payload: QcReportPayload): Promise<QcRequest> {
  const { data } = await apiClient.post<QcRequest>(`/api/qc-requests/${qcRequestId}/report`, payload)
  return data
}

export async function recordQcResult(qcRequestId: number, payload: QcResultPayload): Promise<QcRequest> {
  const { data } = await apiClient.post<QcRequest>(`/api/qc-requests/${qcRequestId}/result`, payload)
  return data
}

export async function uploadQcReportDocument(qcRequestId: number, file: File): Promise<QcRequest> {
  const form = new FormData()
  form.append('file', file)
  // See api/auth.ts's uploadAvatar for why Content-Type must be cleared
  // here -- apiClient's default JSON header otherwise makes axios
  // JSON.stringify the FormData instead of sending it as multipart.
  const { data } = await apiClient.post<QcRequest>(`/api/qc-requests/${qcRequestId}/report-document`, form, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

/** Served behind auth like every other document download in this app --
 * fetch as a blob rather than pointing a link straight at the API path. */
export async function fetchQcReportDocumentBlob(qcRequestId: number): Promise<Blob> {
  const { data } = await apiClient.get(`/api/qc-requests/${qcRequestId}/report-document`, { responseType: 'blob' })
  return data
}
