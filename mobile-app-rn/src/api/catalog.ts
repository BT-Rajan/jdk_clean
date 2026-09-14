import { api, downloadAndOpenFile } from './client';

export interface Product {
  id: number;
  code: string;
  name: string;
  selling_price: number;
}

interface PagedResponse<T> {
  items: T[];
  total: number;
}

export function listProducts(params: { search?: string } = {}) {
  const query = new URLSearchParams();
  query.set('page', '1');
  query.set('page_size', '200');
  query.set('sort', 'name');
  if (params.search) query.set('search', params.search);
  return api<PagedResponse<Product>>(`/api/products?${query.toString()}`);
}

export interface FeasibilityLine {
  product_id: number;
  quantity: number;
}

export interface FeasibilityLineOut {
  id: number;
  product_id: number;
  is_feasible: boolean | null;
  // When the remainder can actually be supplied -- today if fully
  // covered by stock, otherwise the production-capacity scan's
  // projected date (itself never earlier than the slowest raw
  // material's projected procurement date, when materials were short).
  // null only when at least one shortfall's date can't be reliably
  // projected at all, or capacity isn't evaluable for this product.
  estimated_ready_date: string | null;
}

export interface FeasibilityOut {
  id: number;
  feasibility_number: string;
  // 'draft' -- not run yet.
  // 'feasible' -- passed; quotable as-is.
  // 'converted' -- reached here already quoted: either this run_check
  //   call itself auto-created the quotation (Settings ->
  //   auto-create-quotation-on-feasible, admin-controlled -- see
  //   feasibility_service._maybe_auto_create_quotation), or this
  //   feasibility was already converted by an earlier attempt.
  // 'exception_pending' -- short on raw material and/or production
  //   capacity; needs Sales to request an override + admin approval
  //   before it can be quoted (see feasibility_service.decide_exception).
  status: string;
  lines: FeasibilityLineOut[];
}

export function createFeasibility(payload: {
  customer_id: number;
  required_by_date: string; // YYYY-MM-DD
  lines: FeasibilityLine[];
}) {
  return api<FeasibilityOut>('/api/feasibility', { method: 'POST', body: payload });
}

export function runFeasibility(id: number) {
  return api<FeasibilityOut>(`/api/feasibility/${id}/run`, { method: 'POST' });
}

export function requestFeasibilityException(id: number, reason: string) {
  return api<FeasibilityOut>(`/api/feasibility/${id}/exception`, {
    method: 'POST',
    body: { approve: true, reason },
  });
}

export interface QuotationOut {
  id: number;
  quotation_number: string;
  total_amount: number;
  valid_until: string;
}

export function createQuotation(payload: {
  customer_id: number;
  feasibility_id: number;
  quotation_date: string;
  lines: { product_id: number; quantity: number; unit_price: number; discount_percent: number }[];
  language?: 'en' | 'ar';
  // Required when a prior attempt came back 409 because this quotation's
  // material needs overlap another still-open quotation/order -- see
  // backend/app/services/quotation_service.py's check_material_conflicts.
  // Retrying the exact same call with this set to true proceeds anyway.
  material_conflict_acknowledged?: boolean;
}) {
  return api<QuotationOut>('/api/quotations', {
    method: 'POST',
    body: { language: 'en', ...payload },
  });
}

export interface QuotationSummary {
  id: number;
  quotation_number: string;
  quotation_date: string;
  status: string; // 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'
  total_amount: number;
}

// A client's order/quotation history -- Quick Quote is the only thing
// in this app that creates quotations, so this is what "order history"
// means here. Uses /api/quotations (not /api/orders): the sales role
// this app is built for has Quotations read+write already (see
// README's Permissions section) but isn't granted Orders access.
export function listQuotationsForCustomer(customerId: number) {
  const query = new URLSearchParams();
  query.set('customer_id', String(customerId));
  query.set('page_size', '100');
  query.set('sort', '-quotation_date');
  return api<PagedResponse<QuotationSummary>>(`/api/quotations?${query.toString()}`);
}

// Looks up the quotation auto-created for a feasibility check whose
// run_check came back already 'converted' (see FeasibilityOut.status) --
// there's exactly one, since a feasibility can only ever be converted
// once (decide_exception/admin_decide_override all guard on the
// feasibility's current status before acting).
export async function getQuotationForFeasibility(feasibilityId: number): Promise<QuotationOut | null> {
  const query = new URLSearchParams();
  query.set('feasibility_id', String(feasibilityId));
  query.set('page_size', '1');
  const res = await api<PagedResponse<QuotationOut>>(`/api/quotations?${query.toString()}`);
  return res.items[0] ?? null;
}

// Same PDF (same admin-configured template, same LibreOffice render) as
// the web app's Print button and the quotation email attachment -- see
// backend/app/api/quotations.py's download_quotation_pdf.
export function downloadQuotationPdf(quotationId: number, quotationNumber: string): Promise<void> {
  return downloadAndOpenFile(`/api/quotations/${quotationId}/pdf`, `${quotationNumber}.pdf`);
}
