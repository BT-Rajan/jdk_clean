import { api, downloadAndOpenFile } from './client';

interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Mirrors backend/app/models/delivery_note.py's DeliveryNoteStatus.
export type DeliveryNoteStatus = 'draft' | 'issued' | 'cancelled';
// 'draft' is only set at creation, never via the plain status endpoint.
export type SettableDeliveryNoteStatus = 'issued' | 'cancelled';

// Mirrors backend/app/models/delivery_note.py's ALLOWED_TRANSITIONS.
// 'issued' is terminal on purpose -- it drives the linked order to
// 'shipped', a real inventory/order change that shouldn't be reversible
// from here (cancel the order itself instead).
export const DELIVERY_NOTE_TRANSITIONS: Record<DeliveryNoteStatus, SettableDeliveryNoteStatus[]> = {
  draft: ['issued', 'cancelled'],
  issued: [],
  cancelled: [],
};
// Cancelling a delivery note requires a reason, same as orders/quotations.
export const DELIVERY_NOTE_STATUSES_REQUIRING_REASON: SettableDeliveryNoteStatus[] = ['cancelled'];

// Orders in either of these statuses can get a(nother) delivery note --
// an order can be shipped across more than one note (multiple trucks/
// dates) -- see backend/app/services/delivery_note_service.py's
// ELIGIBLE_ORDER_STATUSES.
export const DELIVERY_NOTE_ELIGIBLE_ORDER_STATUSES = ['ready_to_ship', 'shipped'] as const;

export interface DeliveryNoteLineInput {
  product_id: number;
  quantity_delivered: number;
}

export interface DeliveryNoteLine extends DeliveryNoteLineInput {
  id: number;
  product_code: string | null;
  product_name: string | null;
  unit: string | null;
}

export interface DeliveryNote {
  id: number;
  delivery_note_number: string;
  order_id: number;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  delivery_date: string;
  status: DeliveryNoteStatus;
  auto_created: boolean;
  cancel_reason: string | null;
  notes: string | null;
  lines: DeliveryNoteLine[];
  created_at: string;
  updated_at: string;
}

export interface DeliveryNoteCreatePayload {
  order_id: number;
  delivery_date: string;
  notes?: string | null;
  // Omit to auto-populate from the order's own (still outstanding)
  // lines -- see delivery_note_service.create_delivery_note.
  lines?: DeliveryNoteLineInput[];
}

export interface DeliveryNoteUpdatePayload {
  delivery_date?: string;
  notes?: string | null;
  lines?: DeliveryNoteLineInput[];
}

export interface ListDeliveryNotesParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  order_id?: number;
  sort?: string;
}

export function listDeliveryNotes(params: ListDeliveryNotesParams = {}) {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.page_size ?? 50));
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.order_id) query.set('order_id', String(params.order_id));
  query.set('sort', params.sort ?? '-created_at');
  return api<PagedResponse<DeliveryNote>>(`/api/delivery-notes?${query.toString()}`);
}

export function getDeliveryNote(id: number) {
  return api<DeliveryNote>(`/api/delivery-notes/${id}`);
}

export function createDeliveryNote(payload: DeliveryNoteCreatePayload) {
  return api<DeliveryNote>('/api/delivery-notes', { method: 'POST', body: payload });
}

// Only 'draft' notes can be edited -- see delivery_note_service.update_delivery_note.
export function updateDeliveryNote(id: number, payload: DeliveryNoteUpdatePayload) {
  return api<DeliveryNote>(`/api/delivery-notes/${id}`, { method: 'PUT', body: payload });
}

export function updateDeliveryNoteStatus(id: number, status: SettableDeliveryNoteStatus, reason?: string) {
  return api<DeliveryNote>(`/api/delivery-notes/${id}/status`, { method: 'POST', body: { status, reason } });
}

export function deleteDeliveryNote(id: number) {
  return api<{ message: string }>(`/api/delivery-notes/${id}`, { method: 'DELETE' });
}

export function restoreDeliveryNote(id: number) {
  return api<DeliveryNote>(`/api/delivery-notes/${id}/restore`, { method: 'POST' });
}

// Same PDF (same admin-configured template, same LibreOffice render) as
// the web app's Print button and the delivery note email attachment.
export function downloadDeliveryNotePdf(noteId: number, noteNumber: string): Promise<void> {
  return downloadAndOpenFile(`/api/delivery-notes/${noteId}/pdf`, `${noteNumber}.pdf`);
}
