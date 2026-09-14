import { api } from './client';

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
  onboarding_status: string;
  notes: string | null;
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
// backend deliberately omits it (locked after creation).
export function updateCustomer(id: number, payload: Partial<Omit<CustomerInput, 'name' | 'customer_type'>>) {
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
