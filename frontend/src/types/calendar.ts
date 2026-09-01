export interface CalendarEvent {
  id: number
  event_date: string // YYYY-MM-DD
  title: string
  notes: string | null
  all_users: boolean
  created_by: number
  created_by_name: string
  mentioned_usernames: string[]
  /** True when the current user created this entry -- only they can edit/delete it. */
  is_own: boolean
}

export interface MentionableUser {
  id: number
  username: string
  full_name: string
}

export interface CalendarEventInput {
  event_date: string
  title: string
  notes?: string | null
}

export interface DaySnapshotProduction {
  id: number
  batch_number: string
  product_code: string | null
  product_name: string | null
  status: string
  planned_quantity: number
  produced_quantity: number
}

export interface DaySnapshotSale {
  id: number
  order_number: string
  customer_name: string | null
  status: string
  total_amount: number
}

export interface DaySnapshot {
  date: string // YYYY-MM-DD
  production: DaySnapshotProduction[]
  sales: DaySnapshotSale[]
  /** Whether "Log production"/"Log a sale" can still target this date. */
  can_log: boolean
}
