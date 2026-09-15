import { api, downloadAndOpenFile } from './client';

interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Mirrors backend/app/models/order.py's ORDER_STATUSES.
export type OrderStatus = 'draft' | 'confirmed' | 'in_production' | 'ready_to_ship' | 'shipped' | 'delivered' | 'cancelled';
export type SettableOrderStatus = Exclude<OrderStatus, 'draft'>;

// Mirrors backend/app/models/order.py's ALLOWED_TRANSITIONS.
export const ORDER_TRANSITIONS: Record<OrderStatus, SettableOrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'ready_to_ship', 'cancelled'],
  in_production: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['cancelled'],
  cancelled: [],
};
// Mirrors backend/app/models/order.py's STATUSES_REQUIRING_CLOSE_REASON.
export const ORDER_STATUSES_REQUIRING_REASON: SettableOrderStatus[] = ['cancelled'];

export interface OrderLineInput {
  product_id: number;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
}

export interface OrderLine extends OrderLineInput {
  id: number;
  product_code: string | null;
  product_name: string | null;
  unit: string | null;
  discount_percent: number;
  line_total: number;
}

export interface OrderChildSummary {
  id: number;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name: string | null;
  order_date: string;
  requested_delivery_date: string | null;
  confirmed_delivery_date: string | null;
  status: OrderStatus;
  subtotal_amount: number;
  discount_percent: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  close_reason: string | null;
  /** Copied from the source quotation at conversion time. Printed as a
   * QR code on this order's PDF. */
  payment_link: string | null;
  /** Set the moment this order first reaches 'confirmed'. */
  confirmed_at: string | null;
  admin_review_required: boolean;
  /** 'overdue_delivery' or 'payment_overdue' -- null whenever
   * admin_review_required is false. */
  admin_review_reason: 'overdue_delivery' | 'payment_overdue' | null;
  admin_reviewed_at: string | null;
  admin_review_notes: string | null;
  parent_order_id: number | null;
  parent_order_number: string | null;
  child_orders: OrderChildSummary[];
  lines: OrderLine[];
  created_at: string;
  updated_at: string;
}

export interface OrderPayload {
  customer_id: number;
  order_date: string;
  requested_delivery_date?: string | null;
  notes?: string | null;
  discount_percent?: number;
  lines: OrderLineInput[];
}

export interface ListOrdersParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  customer_id?: number;
  sort?: string;
}

export function listOrders(params: ListOrdersParams = {}) {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.page_size ?? 50));
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.customer_id) query.set('customer_id', String(params.customer_id));
  query.set('sort', params.sort ?? '-order_date');
  return api<PagedResponse<Order>>(`/api/orders?${query.toString()}`);
}

export function getOrder(id: number) {
  return api<Order>(`/api/orders/${id}`);
}

// Orders can no longer be created directly -- every order must come
// from an accepted quotation (createOrderFromQuotation below), which
// itself can't exist without a feasibility check; order_service.
// create_order rejects a bare create for exactly that reason.

// Only 'draft' orders can be edited -- see order_service.update_order.
export function updateOrder(id: number, payload: Partial<OrderPayload>) {
  return api<Order>(`/api/orders/${id}`, { method: 'PUT', body: payload });
}

export function updateOrderStatus(id: number, status: SettableOrderStatus, reason?: string) {
  return api<Order>(`/api/orders/${id}/status`, { method: 'POST', body: { status, reason } });
}

// Admin-only -- acknowledges the admin_review_required flag (whatever
// its admin_review_reason) and clears it. See order_service.admin_review.
export function adminReviewOrder(id: number, notes: string) {
  return api<Order>(`/api/orders/${id}/admin-review`, { method: 'POST', body: { notes } });
}

export function deleteOrder(id: number) {
  return api<{ message: string }>(`/api/orders/${id}`, { method: 'DELETE' });
}

export function restoreOrder(id: number) {
  return api<Order>(`/api/orders/${id}/restore`, { method: 'POST' });
}

// Converts an accepted quotation into a new draft order -- see
// order_service.create_order_from_quotation. Only quotations already
// in status 'accepted' can be converted.
export function createOrderFromQuotation(quotationId: number) {
  return api<Order>(`/api/orders/from-quotation/${quotationId}`, { method: 'POST' });
}

// Same PDF (same admin-configured template, same LibreOffice render) as
// the web app's Print button and the order email attachment.
export function downloadOrderPdf(orderId: number, orderNumber: string): Promise<void> {
  return downloadAndOpenFile(`/api/orders/${orderId}/pdf`, `${orderNumber}.pdf`);
}

// Mirrors backend/app/schemas/order_journey.py -- traces the real
// Feasibility -> Quotation -> Order -> Production -> Delivery chain off
// live foreign keys, not a separately maintained status. This is what
// ties the four otherwise-separate screens (Product/Clients/Quotations/
// Orders) into one story for a given order.
export interface JourneyFeasibility {
  id: number;
  feasibility_number: string;
  status: string;
  required_by_date: string | null;
  created_at: string;
  checked_at: string | null;
}

export interface JourneyQuotation {
  id: number;
  quotation_number: string;
  status: string;
  quotation_date: string;
  total_amount: number;
  created_at: string;
}

export interface JourneyProductionBatch {
  id: number;
  batch_number: string;
  status: string;
  product_name: string | null;
  machine_name: string | null;
  planned_quantity: number;
  produced_quantity: number;
  scheduled_start: string;
  scheduled_end: string;
}

export interface JourneyDeliveryNote {
  id: number;
  delivery_note_number: string;
  status: string;
  delivery_date: string;
}

export interface OrderJourney {
  feasibility: JourneyFeasibility | null;
  quotation: JourneyQuotation | null;
  production_batches: JourneyProductionBatch[];
  delivery_notes: JourneyDeliveryNote[];
}

export function getOrderJourney(id: number) {
  return api<OrderJourney>(`/api/orders/${id}/journey`);
}
