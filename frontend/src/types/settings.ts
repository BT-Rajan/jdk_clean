/** Mirrors backend/app/schemas/settings.py. Admin-only. */

export interface Settings {
  company_name: string
  company_address: string
  company_phone: string
  company_email: string
  company_gstin: string
  /** Masked (e.g. "••••••••ab12") once set -- never the real key. Which
   * provider (Claude or DeepSeek) it belongs to is auto-detected
   * server-side from the key's own format -- there's no separate
   * provider choice to make here. */
  ai_api_key: string
  /** Factory-wide worker pool used by the feasibility check's capacity
   * scan alongside each machine's own capacity. Stored/sent as strings
   * (numeric text) like every other setting. */
  factory_total_workers: string
  factory_workday_hours: string
  /** Comma-separated 3-letter day codes, e.g. "Sun,Mon,Tue,Wed,Thu" --
   * which days the factory runs. Drives the feasibility check's capacity
   * scan (and order-confirm auto-scheduling): the scan always starts on
   * the next working day after today and skips non-working days. */
  factory_working_days: string
  /** 'true' or 'false' -- whether a passed/exception-approved feasibility
   * check automatically drafts a quotation. Admin/manager-only to change. */
  auto_create_quotation_from_feasibility: string
  /** 'true' or 'false' -- whether confirming an order automatically
   * schedules a production batch for each line whose product has a
   * machine/time formula set. Admin/manager-only to change. */
  auto_schedule_production_on_order_confirm: string
  /** 'true' or 'false' -- whether an order becoming ready to ship
   * automatically drafts a delivery note. Admin/manager-only to change. */
  auto_create_delivery_note_on_ready_to_ship: string
  /** 'true' or 'false' -- whether an MRP shortage automatically drafts a
   * purchase order. Admin/manager-only to change. */
  auto_draft_purchase_orders_from_mrp: string
  /** Percentage, e.g. "0" or "5". Kuwait has no GST/VAT -- defaults to
   * "0", provisioned for later. */
  default_tax_rate: string
  /** KWD amount, or "" to disable. A PO at/above this can't be sent
   * until an admin approves it. */
  large_po_approval_threshold: string
  /** Percentage, or "" to disable. A document-level discount, or any
   * single line's discount, at/above this can't leave draft until an
   * admin approves it. */
  large_discount_approval_threshold: string
}

export type SettingsPayload = Partial<Settings>
