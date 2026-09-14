import { api, downloadAndOpenFile } from './client';

interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Mirrors backend/app/models/quotation.py's QUOTATION_STATUSES.
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
// 'converted' is deliberately excluded -- only create_order_from_quotation sets it.
export type SettableQuotationStatus = Exclude<QuotationStatus, 'draft' | 'converted'>;

// Mirrors backend/app/models/quotation.py's ALLOWED_TRANSITIONS.
export const QUOTATION_TRANSITIONS: Record<QuotationStatus, SettableQuotationStatus[]> = {
  draft: ['sent', 'rejected'],
  sent: ['accepted', 'rejected', 'expired'],
  accepted: [],
  rejected: [],
  expired: [],
  converted: [],
};
// Mirrors backend/app/models/quotation.py's STATUSES_REQUIRING_CLOSE_REASON.
export const QUOTATION_STATUSES_REQUIRING_REASON: SettableQuotationStatus[] = ['rejected'];

export interface QuotationLineInput {
  product_id: number;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
}

export interface QuotationLine extends QuotationLineInput {
  id: number;
  product_code: string | null;
  product_name: string | null;
  unit: string | null;
  discount_percent: number;
  line_total: number;
}

export interface MaterialConflictCompetitor {
  quotation_id: number;
  quotation_number: string;
}

export interface MaterialConflict {
  raw_material_id: number;
  code: string;
  name: string;
  unit: string;
  required_by_this: number;
  available: number;
  shortfall: number;
  competing_quotations: MaterialConflictCompetitor[];
}

export interface Quotation {
  id: number;
  quotation_number: string;
  customer_id: number;
  customer_name: string | null;
  feasibility_id: number | null;
  auto_created: boolean;
  quotation_date: string;
  valid_until: string | null;
  status: QuotationStatus;
  language: 'en' | 'ar';
  subtotal_amount: number;
  discount_percent: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  converted_order_id: number | null;
  material_conflict_acknowledged: boolean;
  material_conflict_details: MaterialConflict[] | null;
  lines: QuotationLine[];
  created_at: string;
  updated_at: string;
}

export interface QuotationPayload {
  customer_id: number;
  feasibility_id?: number | null;
  quotation_date: string;
  notes?: string | null;
  discount_percent?: number;
  lines: QuotationLineInput[];
  language?: 'en' | 'ar';
  material_conflict_acknowledged?: boolean;
}

export interface ListQuotationsParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  customer_id?: number;
  feasibility_id?: number;
  sort?: string;
}

export function listQuotations(params: ListQuotationsParams = {}) {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.page_size ?? 50));
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.customer_id) query.set('customer_id', String(params.customer_id));
  if (params.feasibility_id) query.set('feasibility_id', String(params.feasibility_id));
  query.set('sort', params.sort ?? '-quotation_date');
  return api<PagedResponse<Quotation>>(`/api/quotations?${query.toString()}`);
}

export function getQuotation(id: number) {
  return api<Quotation>(`/api/quotations/${id}`);
}

export function createQuotation(payload: QuotationPayload) {
  return api<Quotation>('/api/quotations', { method: 'POST', body: { language: 'en', ...payload } });
}

// Only 'draft' quotations can be edited -- see
// quotation_service.update_quotation.
export function updateQuotation(id: number, payload: Partial<QuotationPayload>) {
  return api<Quotation>(`/api/quotations/${id}`, { method: 'PUT', body: payload });
}

export function updateQuotationStatus(id: number, status: SettableQuotationStatus, reason?: string) {
  return api<Quotation>(`/api/quotations/${id}/status`, { method: 'POST', body: { status, reason } });
}

export function deleteQuotation(id: number) {
  return api<{ message: string }>(`/api/quotations/${id}`, { method: 'DELETE' });
}

export function restoreQuotation(id: number) {
  return api<Quotation>(`/api/quotations/${id}/restore`, { method: 'POST' });
}

/** Live pre-check: whether these lines' material needs, combined with
 * every other still-open quotation's own needs, would claim more of a
 * raw material than is actually available. See
 * quotation_service.check_material_conflicts. */
export function checkMaterialConflicts(
  lines: { product_id: number; quantity: number }[],
  excludeQuotationId?: number,
) {
  return api<MaterialConflict[]>('/api/quotations/material-conflicts', {
    method: 'POST',
    body: { lines, exclude_quotation_id: excludeQuotationId },
  });
}

// Same PDF (same admin-configured template, same LibreOffice render) as
// the web app's Print button and the quotation email attachment.
export function downloadQuotationPdf(quotationId: number, quotationNumber: string): Promise<void> {
  return downloadAndOpenFile(`/api/quotations/${quotationId}/pdf`, `${quotationNumber}.pdf`);
}

// Looks up the quotation auto-created for a feasibility check whose
// run_check came back already 'converted' (see FeasibilityOut.status in
// api/feasibility.ts) -- there's exactly one, since a feasibility can
// only ever be converted once.
export async function getQuotationForFeasibility(feasibilityId: number): Promise<Quotation | null> {
  const query = new URLSearchParams();
  query.set('feasibility_id', String(feasibilityId));
  query.set('page_size', '1');
  const res = await api<PagedResponse<Quotation>>(`/api/quotations?${query.toString()}`);
  return res.items[0] ?? null;
}
