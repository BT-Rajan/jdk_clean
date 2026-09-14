import { api, downloadAndOpenFile } from './client';

interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Mirrors backend/app/models/feasibility.py's FEASIBILITY_STATUSES.
export type FeasibilityStatus =
  | 'draft'
  | 'feasible'
  | 'exception_pending'
  | 'exception_approved'
  | 'exception_rejected'
  | 'closed'
  | 'converted'
  | 'expired';

export interface FeasibilityLineInput {
  product_id: number;
  quantity: number;
}

export interface ShortfallItem {
  raw_material_id: number;
  code: string;
  name: string;
  unit: string;
  required: number;
  on_hand: number;
  shortfall: number;
}

export interface FeasibilityLine extends FeasibilityLineInput {
  id: number;
  product_code: string | null;
  product_name: string | null;
  covered_by_stock: number | null;
  bom_missing: boolean | null;
  is_feasible: boolean | null;
  shortfalls: ShortfallItem[];
  capacity_ok: boolean | null;
  // The slowest projected date across every shortfall/capacity check on
  // this line -- null if raw materials are short with no reliable
  // projection, or it isn't evaluable at all.
  estimated_ready_date: string | null;
}

export interface Feasibility {
  id: number;
  feasibility_number: string;
  customer_id: number;
  customer_name: string | null;
  deal_id: number | null;
  deal_number: string | null;
  status: FeasibilityStatus;
  required_by_date: string | null;
  checked_at: string | null;
  exception_reason: string | null;
  close_reason: string | null;
  notes: string | null;
  lines: FeasibilityLine[];
  created_at: string;
  updated_at: string;
}

export interface FeasibilityPayload {
  customer_id: number;
  required_by_date?: string | null;
  notes?: string | null;
  lines: FeasibilityLineInput[];
}

export interface ListFeasibilitiesParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  customer_id?: number;
  sort?: string;
}

export function listFeasibilities(params: ListFeasibilitiesParams = {}) {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.page_size ?? 50));
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.customer_id) query.set('customer_id', String(params.customer_id));
  if (params.sort) query.set('sort', params.sort);
  return api<PagedResponse<Feasibility>>(`/api/feasibility?${query.toString()}`);
}

export function getFeasibility(id: number) {
  return api<Feasibility>(`/api/feasibility/${id}`);
}

export function createFeasibility(payload: FeasibilityPayload) {
  return api<Feasibility>('/api/feasibility', { method: 'POST', body: payload });
}

export function runFeasibilityCheck(id: number) {
  return api<Feasibility>(`/api/feasibility/${id}/run`, { method: 'POST' });
}

// Requested via the "not feasible" outcome -- flags the check for admin
// review (approve: true is what mobile always sends; a straight reject
// isn't a flow Sales has any UI for here). See
// feasibility_service.decide_exception.
export function requestFeasibilityException(id: number, reason: string) {
  return api<Feasibility>(`/api/feasibility/${id}/exception`, {
    method: 'POST',
    body: { approve: true, reason },
  });
}

export function deleteFeasibility(id: number) {
  return api<{ message: string }>(`/api/feasibility/${id}`, { method: 'DELETE' });
}

export function restoreFeasibility(id: number) {
  return api<Feasibility>(`/api/feasibility/${id}/restore`, { method: 'POST' });
}

// Same admin-templated, LibreOffice-rendered docx as the web app's
// feasibility Print/Download button.
export function downloadFeasibilityDocx(id: number, feasibilityNumber: string, language: 'en' | 'ar' = 'en'): Promise<void> {
  return downloadAndOpenFile(`/api/feasibility/${id}/docx?language=${language}`, `${feasibilityNumber}_${language}.docx`);
}
