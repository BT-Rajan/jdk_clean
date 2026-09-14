import { api } from './client';

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

export interface FeasibilityOut {
  id: number;
  feasibility_number: string;
  status: string; // 'draft' | 'feasible' | 'exception_pending' | ...
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
