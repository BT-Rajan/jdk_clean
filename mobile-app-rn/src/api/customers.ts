import { api, uploadFile, viewFile } from './client';

export type CustomerOnboardingStatus = 'pending' | 'under_review' | 'active' | 'on_hold' | 'rejected';

// Mirrors backend/app/models/customer.py ONBOARDING_ALLOWED_TRANSITIONS
// and frontend/src/lib/statusTransitions.ts CUSTOMER_ONBOARDING_TRANSITIONS.
export const CUSTOMER_ONBOARDING_TRANSITIONS: Record<CustomerOnboardingStatus, CustomerOnboardingStatus[]> = {
  pending: ['under_review'],
  under_review: ['active', 'rejected', 'pending'],
  active: ['on_hold'],
  on_hold: ['under_review', 'active'],
  rejected: ['pending'],
};
// Mirrors backend/app/models/customer.py ONBOARDING_STATUSES_REQUIRING_REASON.
export const CUSTOMER_ONBOARDING_STATUSES_REQUIRING_REASON: CustomerOnboardingStatus[] = ['rejected', 'on_hold'];

// Mirrors backend/app/schemas/customer.py exactly -- keep in sync if
// that file changes.
export interface Customer {
  id: number;
  customer_number: string;
  customer_type: 'individual' | 'business';
  code: string | null;
  name: string;
  nature_of_business: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  city: string | null;
  country: string | null;
  credit_limit: number;
  payment_terms_days: number;
  status: 'active' | 'inactive';
  onboarding_status: CustomerOnboardingStatus;
  onboarding_reason: string | null;
  notes: string | null;
  id_document_filename: string | null;
  id_verified: boolean;
  id_verified_at: string | null;
  id_verified_by: number | null;
}

// Mirrors backend/app/schemas/payment.py CustomerCreditStatusOut.
export interface CustomerCreditStatus {
  customer_id: number;
  credit_limit: number;
  limit_enforced: boolean;
  outstanding_balance: number;
  available_credit: number | null;
  id_verified: boolean;
}

export interface CustomerInput {
  customer_type: 'individual' | 'business';
  name: string;
  code?: string | null;
  nature_of_business?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  city?: string | null;
  country?: string | null;
  credit_limit?: number;
  payment_terms_days?: number;
  status?: 'active' | 'inactive';
  notes?: string | null;
}

interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export function listCustomers(params: { search?: string; page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.page_size ?? 50));
  query.set('sort', 'name');
  if (params.search) query.set('search', params.search);
  return api<PagedResponse<Customer>>(`/api/customers?${query.toString()}`);
}

export function getCustomer(id: number) {
  return api<Customer>(`/api/customers/${id}`);
}

export function createCustomer(payload: CustomerInput) {
  return api<Customer>('/api/customers', { method: 'POST', body: payload });
}

// name is intentionally not sendable here -- CustomerUpdate on the
// backend deliberately omits it (locked after creation). customer_type
// IS editable at any time per that same schema (only name and, via the
// one-directional rule below, an already-set code are locked) -- see
// backend/app/schemas/customer.py's CustomerUpdate docstring.
export function updateCustomer(id: number, payload: Partial<Omit<CustomerInput, 'name'>>) {
  return api<Customer>(`/api/customers/${id}`, { method: 'PUT', body: payload });
}

export function deleteCustomer(id: number) {
  return api<{ message: string }>(`/api/customers/${id}`, { method: 'DELETE' });
}

export function restoreCustomer(id: number) {
  return api<Customer>(`/api/customers/${id}/restore`, { method: 'POST' });
}

export function activateCustomer(id: number) {
  return api<Customer>(`/api/customers/${id}/activate`, { method: 'POST' });
}

export function deactivateCustomer(id: number) {
  return api<Customer>(`/api/customers/${id}/deactivate`, { method: 'POST' });
}

// Credit limit, current outstanding balance, and what's left before
// order_service.change_status starts refusing to confirm a new order
// for this customer without admin approval.
export function getCustomerCredit(id: number) {
  return api<CustomerCreditStatus>(`/api/customers/${id}/credit`);
}

export function updateCustomerOnboardingStatus(id: number, status: CustomerOnboardingStatus, reason?: string) {
  return api<Customer>(`/api/customers/${id}/onboarding-status`, { method: 'POST', body: { status, reason } });
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  file?: File; // set on web by expo-document-picker -- see client.ts's uploadFile
}

export function uploadCustomerIdDocument(id: number, asset: PickedFile) {
  return uploadFile<Customer>(`/api/customers/${id}/id-document`, asset);
}

export function deleteCustomerIdDocument(id: number) {
  return api<Customer>(`/api/customers/${id}/id-document`, { method: 'DELETE' });
}

// Behind auth like every other file endpoint -- view/download it as a
// blob rather than pointing something straight at the API path.
export function viewCustomerIdDocument(id: number, filename: string) {
  return viewFile(`/api/customers/${id}/id-document`, filename);
}

export function verifyCustomerId(id: number) {
  return api<Customer>(`/api/customers/${id}/verify-id`, { method: 'POST' });
}

export function unverifyCustomerId(id: number) {
  return api<Customer>(`/api/customers/${id}/unverify-id`, { method: 'POST' });
}
