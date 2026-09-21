export interface SalesHomeCounts {
  customers: number
  open_feasibility: number
  open_quotations: number
  active_orders: number
  /** Invoices auto-created on order confirm, not yet given a payment link. */
  invoices_waiting_finance: number
  /** Invoices with a live payment link, not yet fully paid. */
  invoices_awaiting_payment: number
  /** Paid invoices whose order hasn't shipped yet. */
  invoices_paid_processing: number
  attention: number
}

export interface SalesAttentionItem {
  kind: string
  title: string
  detail: string
  customer_name: string
  link: string
}

export interface SalesmanWorkloadRow {
  /** null for the "Unassigned" row -- customers nobody owns yet. */
  user_id: number | null
  name: string
  customers: number
  open_quotations: number
  active_orders: number
  attention: number
}

export interface SalesHome {
  /** 'own' = a salesman (their customers only); 'all' = Sales Manager / admin. */
  scope: 'own' | 'all'
  counts: SalesHomeCounts
  attention: SalesAttentionItem[]
  salesmen: SalesmanWorkloadRow[]
}
